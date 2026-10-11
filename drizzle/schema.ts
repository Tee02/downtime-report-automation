import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const savedDowntimeReports = mysqlTable("savedDowntimeReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull(),
  sourceFileName: varchar("sourceFileName", { length: 512 }).notNull(),
  sourceFileUrl: text("sourceFileUrl").notNull(),
  outputFileName: varchar("outputFileName", { length: 512 }).notNull(),
  outputFileUrl: text("outputFileUrl").notNull(),
  totalTechnicalMinutes: int("totalTechnicalMinutes").notNull(),
  totalNetworkPercentage: double("totalNetworkPercentage").notNull(),
  weatherIntervalCount: int("weatherIntervalCount").notNull().default(0),
  weatherText: text("weatherText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SavedDowntimeReport = typeof savedDowntimeReports.$inferSelect;
export type InsertSavedDowntimeReport = typeof savedDowntimeReports.$inferInsert;

export const darkDays = mysqlTable("darkDays", {
  id: int("id").autoincrement().primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DarkDay = typeof darkDays.$inferSelect;
export type InsertDarkDay = typeof darkDays.$inferInsert;

export const siteContent = mysqlTable("siteContent", {
  id: int("id").autoincrement().primaryKey(),
  contentKey: varchar("contentKey", { length: 64 }).notNull().unique(),
  contentValue: text("contentValue").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteContent = typeof siteContent.$inferSelect;
export type InsertSiteContent = typeof siteContent.$inferInsert;

export const downtimeSummaries = mysqlTable("downtimeSummaries", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull(),
  sourceReportId: int("sourceReportId").notNull(),
  amExecutive: varchar("amExecutive", { length: 255 }).notNull().default(""),
  pmExecutive: varchar("pmExecutive", { length: 255 }).notNull().default(""),
  zoneBAmExecutive: varchar("zoneBAmExecutive", { length: 255 }).notNull().default(""),
  zoneBPmExecutive: varchar("zoneBPmExecutive", { length: 255 }).notNull().default(""),
  generatedFileName: varchar("generatedFileName", { length: 512 }),
  generatedFileUrl: text("generatedFileUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DowntimeSummary = typeof downtimeSummaries.$inferSelect;
export type InsertDowntimeSummary = typeof downtimeSummaries.$inferInsert;

export const downtimeSummaryEntries = mysqlTable("downtimeSummaryEntries", {
  id: int("id").autoincrement().primaryKey(),
  summaryId: int("summaryId").notNull(),
  incidentKey: varchar("incidentKey", { length: 128 }).notNull(),
  incidentOrder: int("incidentOrder").notNull().default(0),
  zone: varchar("zone", { length: 32 }).notNull().default("Zone 1"),
  rideCode: varchar("rideCode", { length: 32 }).notNull(),
  attraction: varchar("attraction", { length: 512 }).notNull(),
  description: text("description").notNull(),
  downtimeStart: varchar("downtimeStart", { length: 16 }).notNull(),
  downtimeEnd: varchar("downtimeEnd", { length: 16 }).notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  shift: varchar("shift", { length: 8 }).notNull(),
  recurringDowntime: varchar("recurringDowntime", { length: 8 }).notNull().default("No"),
  recurringDowntimeDays: varchar("recurringDowntimeDays", { length: 32 }).notNull().default("N/A"),
  incident: varchar("incident", { length: 8 }).notNull().default("No"),
  rootCause: text("rootCause"),
  correctiveAction: text("correctiveAction"),
  preventiveAction: text("preventiveAction"),
  partsReplaced: text("partsReplaced"),
  followUpAction: text("followUpAction"),
  anrNo: text("anrNo"),
  supportInfo: text("supportInfo"),
  supportPhotoUrl: text("supportPhotoUrl"),
  supportPhotoName: varchar("supportPhotoName", { length: 512 }),
  status: varchar("status", { length: 32 }).notNull().default("Monitoring"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DowntimeSummaryEntry = typeof downtimeSummaryEntries.$inferSelect;
export type InsertDowntimeSummaryEntry = typeof downtimeSummaryEntries.$inferInsert;

export const downtimeSummaryImports = mysqlTable("downtimeSummaryImports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileType: varchar("fileType", { length: 32 }).notNull(),
  extractedText: text("extractedText"),
  convertedDocxFileName: varchar("convertedDocxFileName", { length: 512 }),
  convertedDocxUrl: text("convertedDocxUrl"),
  matchedEntries: text("matchedEntries"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DowntimeSummaryImport = typeof downtimeSummaryImports.$inferSelect;
export type InsertDowntimeSummaryImport = typeof downtimeSummaryImports.$inferInsert;

export const downtimeSummaryDrafts = mysqlTable("downtimeSummaryDrafts", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull(),
  zone: varchar("zone", { length: 32 }).notNull().default("Zone A"),
  rideCode: varchar("rideCode", { length: 32 }).notNull(),
  attraction: varchar("attraction", { length: 512 }).notNull().default(""),
  description: text("description"),
  downtimeStart: varchar("downtimeStart", { length: 16 }).notNull().default(""),
  downtimeEnd: varchar("downtimeEnd", { length: 16 }).notNull().default(""),
  durationMinutes: int("durationMinutes").notNull().default(0),
  rootCause: text("rootCause"),
  correctiveAction: text("correctiveAction"),
  preventiveAction: text("preventiveAction"),
  followUpAction: text("followUpAction"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DowntimeSummaryDraft = typeof downtimeSummaryDrafts.$inferSelect;
export type InsertDowntimeSummaryDraft = typeof downtimeSummaryDrafts.$inferInsert;

/**
 * Persistent Faultpedia entries.  Image files themselves remain in project
 * storage; this table holds only their secure storage references and the
 * structured troubleshooting knowledge shown in the Wiki.
 */
export const faultpediaCards = mysqlTable("faultpediaCards", {
  id: int("id").autoincrement().primaryKey(),
  rideCode: varchar("rideCode", { length: 32 }).notNull(),
  rideName: varchar("rideName", { length: 512 }).notNull(),
  faultDate: varchar("faultDate", { length: 10 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  faultCode: varchar("faultCode", { length: 255 }).notNull().default("Reference"),
  severity: varchar("severity", { length: 16 }).notNull().default("Watch"),
  category: varchar("category", { length: 32 }).notNull().default("Other"),
  description: text("description").notNull(),
  rootCause: text("rootCause").notNull(),
  correctiveAction: text("correctiveAction").notNull(),
  preventiveAction: text("preventiveAction").notNull(),
  referenceCount: int("referenceCount").notNull().default(0),
  manualScreenshotName: varchar("manualScreenshotName", { length: 512 }),
  manualScreenshotUrl: text("manualScreenshotUrl"),
  supportPhotoName: varchar("supportPhotoName", { length: 512 }),
  supportPhotoUrl: text("supportPhotoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FaultpediaCard = typeof faultpediaCards.$inferSelect;
export type InsertFaultpediaCard = typeof faultpediaCards.$inferInsert;

/**
 * A compact immutable KPI snapshot is written when each daily source log is
 * processed.  Analysis calendars can therefore render historic heat-map data
 * without reopening and calculating every archived spreadsheet.
 */
export const analysisDailySnapshots = mysqlTable("analysisDailySnapshots", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull().unique(),
  reportId: int("reportId"),
  snapshotJson: text("snapshotJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisDailySnapshot = typeof analysisDailySnapshots.$inferSelect;
export type InsertAnalysisDailySnapshot = typeof analysisDailySnapshots.$inferInsert;

/** Persisted recent A/B(/C) comparison configurations, capped to ten rows. */
export const analysisComparisonHistories = mysqlTable("analysisComparisonHistories", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 1024 }).notNull(),
  scenariosJson: text("scenariosJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalysisComparisonHistory = typeof analysisComparisonHistories.$inferSelect;
export type InsertAnalysisComparisonHistory = typeof analysisComparisonHistories.$inferInsert;

/**
 * Digital ride logbook for opening, closing, overtime, dark-day, rehabilitation,
 * and preventive-maintenance activity. Raw supervisor messages are retained with
 * an optional concise summary for fast calendar scanning and Excel export.
 */
export const pmTrackerLogs = mysqlTable("pmTrackerLogs", {
  id: int("id").autoincrement().primaryKey(),
  logDate: varchar("logDate", { length: 10 }).notNull(),
  zone: varchar("zone", { length: 16 }).notNull(),
  rideCode: varchar("rideCode", { length: 32 }).notNull(),
  rideName: varchar("rideName", { length: 512 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("Completed"),
  workType: varchar("workType", { length: 64 }).notNull(),
  technician: varchar("technician", { length: 255 }).notNull().default(""),
  summary: varchar("summary", { length: 512 }).notNull().default(""),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PmTrackerLog = typeof pmTrackerLogs.$inferSelect;
export type InsertPmTrackerLog = typeof pmTrackerLogs.$inferInsert;
