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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SavedDowntimeReport = typeof savedDowntimeReports.$inferSelect;
export type InsertSavedDowntimeReport = typeof savedDowntimeReports.$inferInsert;
