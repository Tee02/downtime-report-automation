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
  listAnalysisComparisonHistories,
  listSavedDowntimeReports,
  recordDowntimeSummaryImport,
  saveDowntimeSummaryState,
  createDowntimeSummaryDraft,
  updateDowntimeSummaryDraft,
  deleteDowntimeSummaryDraft,
  setDarkDay,
  setSiteContent,
  saveAnalysisComparisonHistory,
  upsertUser,
  listFaultpediaCards,
  createFaultpediaCard,
  updateFaultpediaCard,
  deleteFaultpediaCard,
  listPmTrackerLogs,
  createPmTrackerLog,
  updatePmTrackerLog,
  deletePmTrackerLog,
} from "./db";
import { buildAnalysis, exportCompiledDowntimeLog, loadSavedDowntimeReports } from "./downtimeAnalysis";
import { buildDowntimeSummaryDocx, type SummaryEntryData } from "./downtimeSummaryDocx";
import { buildPmTrackerWorkbook, EXCEL_CONTENT_TYPE } from "./pmTrackerExcel";
import { storagePut } from "./storage";

const analysisInput = z.object({
  reportIds: z.array(z.number().int().positive()).max(60).default([]),
  rideCodes: z.array(z.string().min(1).max(16)).max(24).default([]),
});

const summaryEntryInput = z.object({
  incidentKey: z.string(),
  zone: z.string().default("Zone A"),
  rideCode: z.string(),
  attraction: z.string(),
  description: z.string(),
  downtimeStart: z.string(),
  downtimeEnd: z.string(),
  durationMinutes: z.number().int(),
  shift: z.string(),
  recurringDowntime: z.enum(["Yes", "No"]).default("No"),
  recurringDowntimeDays: z.string().default("N/A"),
  incident: z.enum(["Yes", "No"]).default("No"),
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
  comparisonHistory: router({
    list: publicProcedure.query(() => listAnalysisComparisonHistories()),
    record: publicProcedure
      .input(z.object({
        label: z.string().trim().min(3).max(1024),
        scenariosJson: z.string().min(2).max(16000),
      }))
      .mutation(async ({ input }) => {
        await saveAnalysisComparisonHistory({
          label: input.label,
          scenariosJson: input.scenariosJson,
        });
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
          zoneBAmExecutive: z.string().default(""),
          zoneBPmExecutive: z.string().default(""),
          entries: z.array(summaryEntryInput),
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
          zoneBAmExecutive: z.string().default(""),
          zoneBPmExecutive: z.string().default(""),
          entries: z.array(summaryEntryInput),
          // Entries remain the full daily form.  The selected keys control only
          // which ready records are rendered into this particular DOCX export.
          exportEntryKeys: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const selectedKeys = new Set(input.exportEntryKeys || []);
        const entriesToExport = selectedKeys.size
          ? input.entries.filter(entry => selectedKeys.has(entry.incidentKey))
          : input.entries;
        if (!entriesToExport.length) {
          throw new Error("Select at least one completed downtime event before exporting.");
        }
        const docxBuffer = await buildDowntimeSummaryDocx({
          ...input,
          entries: entriesToExport,
        } as any);
        const datePart = input.reportDate.replace(/-/g, "");
        const fileName = `DailyDowntimeSummaryReport-${datePart}.docx`;
        const stored = await storagePut(
          `downtime-summaries/${crypto.randomUUID()}/${fileName}`,
          docxBuffer,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );

        // Persist every card in the daily workspace, including intentionally
        // unticked or incomplete cards, so a download can never make them vanish.
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
          extractedText: z.string().nullable().optional(),
          convertedDocxFileName: z.string().nullable().optional(),
          convertedDocxUrl: z.string().nullable().optional(),
          matchedEntries: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return recordDowntimeSummaryImport(input);
      }),
    createDraft: publicProcedure
      .input(
        z.object({
          reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          zone: z.string().default("Zone A"),
          rideCode: z.string(),
          attraction: z.string().default(""),
          description: z.string().default(""),
          downtimeStart: z.string().default(""),
          downtimeEnd: z.string().default(""),
          durationMinutes: z.number().int().default(0),
          rootCause: z.string().nullable().optional(),
          correctiveAction: z.string().nullable().optional(),
          preventiveAction: z.string().nullable().optional(),
          followUpAction: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return createDowntimeSummaryDraft(input);
      }),
    updateDraft: publicProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          zone: z.string().optional(),
          rideCode: z.string().optional(),
          attraction: z.string().optional(),
          description: z.string().optional(),
          downtimeStart: z.string().optional(),
          downtimeEnd: z.string().optional(),
          durationMinutes: z.number().int().optional(),
          rootCause: z.string().nullable().optional(),
          correctiveAction: z.string().nullable().optional(),
          preventiveAction: z.string().nullable().optional(),
          followUpAction: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updateDowntimeSummaryDraft(id, data);
      }),
    deleteDraft: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        return deleteDowntimeSummaryDraft(input.id);
      }),
  }),
  faultpedia: router({
    list: publicProcedure.query(async () => {
      return listFaultpediaCards();
    }),
    create: publicProcedure
      .input(
        z.object({
          rideCode: z.string(),
          rideName: z.string(),
          faultDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
          title: z.string(),
          faultCode: z.string().default("Reference"),
          severity: z.string().default("Watch"),
          category: z.enum(["Electrical", "Mechanical", "Other"]).default("Other"),
          description: z.string().default(""),
          rootCause: z.string(),
          correctiveAction: z.string(),
          preventiveAction: z.string(),
          referenceCount: z.number().int().default(0),
          manualScreenshotName: z.string().nullable().optional(),
          manualScreenshotUrl: z.string().nullable().optional(),
          supportPhotoName: z.string().nullable().optional(),
          supportPhotoUrl: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return createFaultpediaCard(input as any);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          rideCode: z.string().optional(),
          rideName: z.string().optional(),
          title: z.string().optional(),
          faultCode: z.string().optional(),
          category: z.enum(["Electrical", "Mechanical", "Other"]).optional(),
          description: z.string().optional(),
          rootCause: z.string().optional(),
          correctiveAction: z.string().optional(),
          preventiveAction: z.string().optional(),
          manualScreenshotName: z.string().nullable().optional(),
          manualScreenshotUrl: z.string().nullable().optional(),
          supportPhotoName: z.string().nullable().optional(),
          supportPhotoUrl: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updateFaultpediaCard(id, data as any);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        return deleteFaultpediaCard(input.id);
      }),
  }),
  pmTracker: router({
    list: publicProcedure.query(async () => {
      return listPmTrackerLogs();
    }),
    create: publicProcedure
      .input(
        z.object({
          logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          zone: z.enum(["Zone A", "Zone B"]),
          rideCode: z.string().min(1),
          rideName: z.string().min(1),
          status: z.enum(["Completed", "Pending", "In Progress"]).default("Completed"),
          workType: z.enum([
            "Opening startup",
            "Closing inspection",
            "Morning OT",
            "Night OT",
            "Darkday work",
            "Rehab work",
            "Weekly PM",
            "Monthly PM",
            "Unscheduled repair",
          ]),
          technician: z.string().default(""),
          summary: z.string().default(""),
          message: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        return createPmTrackerLog(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          zone: z.enum(["Zone A", "Zone B"]).optional(),
          rideCode: z.string().optional(),
          rideName: z.string().optional(),
          status: z.enum(["Completed", "Pending", "In Progress"]).optional(),
          workType: z.enum([
            "Opening startup",
            "Closing inspection",
            "Morning OT",
            "Night OT",
            "Darkday work",
            "Rehab work",
            "Weekly PM",
            "Monthly PM",
            "Unscheduled repair",
          ]).optional(),
          technician: z.string().optional(),
          summary: z.string().optional(),
          message: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updatePmTrackerLog(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        return deletePmTrackerLog(input.id);
      }),
    exportExcel: publicProcedure
      .input(
        z.object({
          zone: z.enum(["Zone A", "Zone B"]),
          rideCode: z.string().optional(),
          status: z.enum(["Completed", "Pending", "In Progress"]).optional(),
          query: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const keyword = input.query?.trim().toLowerCase();
        const logs = (await listPmTrackerLogs()).filter((log) => {
          if (log.zone !== input.zone) return false;
          if (input.rideCode && log.rideCode !== input.rideCode) return false;
          if (input.status && log.status !== input.status) return false;
          if (!keyword) return true;
          return [log.rideCode, log.rideName, log.workType, log.technician, log.summary, log.message]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
        });

        const outputBuffer = await buildPmTrackerWorkbook(logs);
        const fileName = `PM_Tracker_${input.zone.replace(" ", "_")}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
        const stored = await storagePut(
          `pm-tracker-exports/${crypto.randomUUID()}/${fileName}`,
          outputBuffer,
          EXCEL_CONTENT_TYPE
        );
        return { fileName, downloadUrl: stored.url, logCount: logs.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
