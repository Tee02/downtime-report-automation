import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  deleteSavedDowntimeReport,
  getDowntimeSummaryByDate,
  getSavedDowntimeReportsByIds,
  getSiteContent,
  listAllDowntimeSummaryDates,
  listAllSiteContent,
  listDarkDays,
  listSavedDowntimeReports,
  recordDowntimeSummaryImport,
  saveDowntimeSummaryState,
  setDarkDay,
  setSiteContent,
  upsertUser,
} from "./db";
import { buildAnalysis, exportCompiledDowntimeLog, loadSavedDowntimeReports } from "./downtimeAnalysis";
import { buildDowntimeSummaryDocx, type SummaryEntryData } from "./downtimeSummaryDocx";
import { storagePut } from "./storage";

const analysisInput = z.object({
  reportIds: z.array(z.number().int().positive()).max(60).default([]),
  rideCodes: z.array(z.string().min(1).max(16)).max(24).default([]),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    loginWithPasscode: publicProcedure
      .input(z.object({ passcode: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (input.passcode.trim() !== "494") {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Incorrect password. Please try again.",
          });
        }

        const openId = "operator-494";
        await upsertUser({
          openId,
          name: "SkyWorlds Operator",
          email: "operator@skyworlds.local",
          loginMethod: "passcode",
          role: "admin",
          lastSignedIn: new Date(),
        });

        const token = await sdk.createSessionToken(openId, { name: "SkyWorlds Operator" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return {
          success: true,
          user: {
            openId,
            name: "SkyWorlds Operator",
            role: "admin" as const,
          },
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  savedReports: router({
    list: publicProcedure.query(() => listSavedDowntimeReports()),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteSavedDowntimeReport(input.id);
      return { success: true };
    }),
  }),
  darkDays: router({
    list: publicProcedure.query(() => listDarkDays()),
    set: publicProcedure.input(z.object({
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isDarkDay: z.boolean(),
    })).mutation(async ({ input }) => {
      await setDarkDay(input.dateKey, input.isDarkDay);
      return { success: true };
    }),
  }),
  siteContent: router({
    list: publicProcedure.query(async () => {
      return listAllSiteContent();
    }),
    get: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return { value: await getSiteContent(input.key) };
      }),
    set: protectedProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await setSiteContent(input.key, input.value);
        return { success: true };
      }),
  }),
  analysis: router({
    get: publicProcedure.input(analysisInput).query(async ({ input }) => {
      if (!input.reportIds.length) return null;
      const reports = await getSavedDowntimeReportsByIds(input.reportIds);
      if (reports.length !== input.reportIds.length) throw new Error("One or more selected saved reports are no longer available.");
      const [loaded, darkDaysList] = await Promise.all([
        loadSavedDowntimeReports(reports),
        listDarkDays(),
      ]);
      return buildAnalysis(
        loaded.map(item => ({
          reportDate: item.report.reportDate,
          records: item.records,
          weatherText: item.report.weatherText,
        })),
        input.rideCodes,
        darkDaysList
      );
    }),
    export: publicProcedure.input(analysisInput).mutation(async ({ input }) => {
      if (!input.reportIds.length) throw new Error("Please select at least one report to export.");
      const reports = await getSavedDowntimeReportsByIds(input.reportIds);
      if (reports.length !== input.reportIds.length) throw new Error("One or more selected saved reports are no longer available.");
      return exportCompiledDowntimeLog(reports, input.rideCodes);
    }),
  }),
  downtimeSummary: router({
    getByDate: publicProcedure
      .input(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        return getDowntimeSummaryByDate(input.dateKey);
      }),
    listDatesWithData: publicProcedure.query(async () => {
      return listAllDowntimeSummaryDates();
    }),
    save: publicProcedure
      .input(
        z.object({
          reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          sourceReportId: z.number().int().positive(),
          amExecutive: z.string().default(""),
          pmExecutive: z.string().default(""),
          entries: z.array(
            z.object({
              incidentKey: z.string(),
              zone: z.string().default("Zone 1"),
              rideCode: z.string(),
              attraction: z.string(),
              description: z.string(),
              downtimeStart: z.string(),
              downtimeEnd: z.string(),
              durationMinutes: z.number().int(),
              shift: z.string(),
              rootCause: z.string().nullable().optional(),
              correctiveAction: z.string().nullable().optional(),
              preventiveAction: z.string().nullable().optional(),
              partsReplaced: z.string().nullable().optional(),
              followUpAction: z.string().nullable().optional(),
              anrNo: z.string().nullable().optional(),
              supportInfo: z.string().nullable().optional(),
              supportPhotoUrl: z.string().nullable().optional(),
              supportPhotoName: z.string().nullable().optional(),
              status: z.string().default("Monitoring"),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        return saveDowntimeSummaryState(input as any);
      }),
    generateDocx: publicProcedure
      .input(
        z.object({
          reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          sourceReportId: z.number().int().positive(),
          amExecutive: z.string().default(""),
          pmExecutive: z.string().default(""),
          entries: z.array(
            z.object({
              incidentKey: z.string(),
              zone: z.string().default("Zone 1"),
              rideCode: z.string(),
              attraction: z.string(),
              description: z.string(),
              downtimeStart: z.string(),
              downtimeEnd: z.string(),
              durationMinutes: z.number().int(),
              shift: z.string(),
              rootCause: z.string().nullable().optional(),
              correctiveAction: z.string().nullable().optional(),
              preventiveAction: z.string().nullable().optional(),
              partsReplaced: z.string().nullable().optional(),
              followUpAction: z.string().nullable().optional(),
              anrNo: z.string().nullable().optional(),
              supportInfo: z.string().nullable().optional(),
              supportPhotoUrl: z.string().nullable().optional(),
              supportPhotoName: z.string().nullable().optional(),
              status: z.string().default("Monitoring"),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const docxBuffer = await buildDowntimeSummaryDocx(input as any);
        const datePart = input.reportDate.replace(/-/g, "");
        const fileName = `DailyDowntimeSummaryReport-${datePart}.docx`;
        const stored = await storagePut(
          `downtime-summaries/${crypto.randomUUID()}/${fileName}`,
          docxBuffer,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );

        await saveDowntimeSummaryState({
          ...input,
          generatedFileName: fileName,
          generatedFileUrl: stored.url,
        } as any);

        return {
          fileName,
          downloadUrl: stored.url,
        };
      }),
    recordImport: publicProcedure
      .input(
        z.object({
          reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          fileName: z.string(),
          fileUrl: z.string(),
          fileType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        return recordDowntimeSummaryImport(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;
