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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DowntimeSummaryImport = typeof downtimeSummaryImports.$inferSelect;
export type InsertDowntimeSummaryImport = typeof downtimeSummaryImports.$inferInsert;
