import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { deleteSavedDowntimeReport, getSavedDowntimeReportsByIds, listSavedDowntimeReports } from "./db";
import { buildAnalysis, exportCompiledDowntimeLog, loadSavedDowntimeReports } from "./downtimeAnalysis";

const analysisInput = z.object({
  reportIds: z.array(z.number().int().positive()).min(1).max(60),
  rideCodes: z.array(z.string().min(1).max(16)).max(24),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  savedReports: router({
    list: protectedProcedure.query(() => listSavedDowntimeReports()),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteSavedDowntimeReport(input.id);
      return { success: true };
    }),
  }),
  analysis: router({
    get: protectedProcedure.input(analysisInput).query(async ({ input }) => {
      const reports = await getSavedDowntimeReportsByIds(input.reportIds);
      if (reports.length !== input.reportIds.length) throw new Error("One or more selected saved reports are no longer available.");
      const loaded = await loadSavedDowntimeReports(reports);
      return buildAnalysis(loaded.map(item => ({ reportDate: item.report.reportDate, records: item.records })), input.rideCodes);
    }),
    export: protectedProcedure.input(analysisInput).mutation(async ({ input }) => {
      const reports = await getSavedDowntimeReportsByIds(input.reportIds);
      if (reports.length !== input.reportIds.length) throw new Error("One or more selected saved reports are no longer available.");
      return exportCompiledDowntimeLog(reports, input.rideCodes);
    }),
  }),
});

export type AppRouter = typeof appRouter;
