import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertDowntimeSummary,
  InsertDowntimeSummaryEntry,
  InsertDowntimeSummaryImport,
  InsertDowntimeSummaryDraft,
  InsertSavedDowntimeReport,
  InsertUser,
  darkDays,
  downtimeSummaries,
  downtimeSummaryDrafts,
  downtimeSummaryEntries,
  downtimeSummaryImports,
  savedDowntimeReports,
  siteContent,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createSavedDowntimeReport(report: InsertSavedDowntimeReport) {
  const db = await getDb();
  if (!db) throw new Error("The report library is temporarily unavailable. Your workbook was generated but could not be saved.");
  await db.insert(savedDowntimeReports).values(report);
}

export async function findSavedDowntimeReport(reportDate: string) {
  const db = await getDb();
  if (!db) throw new Error("The report library is temporarily unavailable.");
  const reports = await db
    .select({ id: savedDowntimeReports.id })
    .from(savedDowntimeReports)
    .where(eq(savedDowntimeReports.reportDate, reportDate))
    .limit(1);
  return reports[0];
}

export async function listSavedDowntimeReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savedDowntimeReports).orderBy(desc(savedDowntimeReports.createdAt)).limit(100);
}

export async function getSavedDowntimeReportsByIds(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("The report library is temporarily unavailable.");
  return db.select().from(savedDowntimeReports).where(inArray(savedDowntimeReports.id, ids));
}

export async function deleteSavedDowntimeReport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("The report library is temporarily unavailable.");
  await db.delete(savedDowntimeReports).where(eq(savedDowntimeReports.id, id));
}

export async function listDarkDays(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ dateKey: darkDays.dateKey }).from(darkDays).orderBy(darkDays.dateKey);
  return rows.map(r => r.dateKey);
}

export async function setDarkDay(dateKey: string, isDarkDay: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("The database is temporarily unavailable.");
  if (isDarkDay) {
    await db.insert(darkDays).values({ dateKey }).onDuplicateKeyUpdate({ set: { dateKey } });
  } else {
    await db.delete(darkDays).where(eq(darkDays.dateKey, dateKey));
  }
}

export async function getSiteContent(contentKey: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(siteContent).where(eq(siteContent.contentKey, contentKey)).limit(1);
  return rows[0]?.contentValue ?? null;
}

export async function listAllSiteContent(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(siteContent);
  const map: Record<string, string> = {};
  rows.forEach(r => {
    map[r.contentKey] = r.contentValue;
  });
  return map;
}

export async function setSiteContent(contentKey: string, contentValue: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("The database is temporarily unavailable.");
  await db.insert(siteContent).values({ contentKey, contentValue }).onDuplicateKeyUpdate({
    set: { contentValue },
  });
}

export async function getDowntimeSummaryByDate(reportDate: string) {
  const db = await getDb();
  if (!db) return null;
  const summaries = await db.select().from(downtimeSummaries).where(eq(downtimeSummaries.reportDate, reportDate)).limit(1);
  const summary = summaries[0] ?? null;
  const entries = summary
    ? await db.select().from(downtimeSummaryEntries).where(eq(downtimeSummaryEntries.summaryId, summary.id)).orderBy(downtimeSummaryEntries.incidentOrder, downtimeSummaryEntries.id)
    : [];
  const imports = await db.select().from(downtimeSummaryImports).where(eq(downtimeSummaryImports.reportDate, reportDate)).orderBy(desc(downtimeSummaryImports.createdAt)).limit(1);
  const drafts = await db.select().from(downtimeSummaryDrafts).where(eq(downtimeSummaryDrafts.reportDate, reportDate)).orderBy(downtimeSummaryDrafts.downtimeStart, downtimeSummaryDrafts.id);
  return {
    summary,
    entries,
    imports,
    drafts,
  };
}

export async function listAllDowntimeSummaryDates(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const [summaryRows, importRows, draftRows] = await Promise.all([
    db.select({ reportDate: downtimeSummaries.reportDate }).from(downtimeSummaries),
    db.select({ reportDate: downtimeSummaryImports.reportDate }).from(downtimeSummaryImports),
    db.select({ reportDate: downtimeSummaryDrafts.reportDate }).from(downtimeSummaryDrafts),
  ]);
  return Array.from(new Set([...summaryRows.map(r => r.reportDate), ...importRows.map(r => r.reportDate), ...draftRows.map(r => r.reportDate)])).sort();
}

export async function saveDowntimeSummaryState(params: {
  reportDate: string;
  sourceReportId: number;
  amExecutive: string;
  pmExecutive: string;
  zoneBAmExecutive?: string;
  zoneBPmExecutive?: string;
  generatedFileName?: string | null;
  generatedFileUrl?: string | null;
  entries: Array<Omit<InsertDowntimeSummaryEntry, "summaryId">>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(downtimeSummaries).where(eq(downtimeSummaries.reportDate, params.reportDate)).limit(1);
  let summaryId: number;
  if (existing.length) {
    summaryId = existing[0].id;
    await db.update(downtimeSummaries).set({
      sourceReportId: params.sourceReportId,
      amExecutive: params.amExecutive,
      pmExecutive: params.pmExecutive,
      ...(params.zoneBAmExecutive !== undefined ? { zoneBAmExecutive: params.zoneBAmExecutive } : {}),
      ...(params.zoneBPmExecutive !== undefined ? { zoneBPmExecutive: params.zoneBPmExecutive } : {}),
      ...(params.generatedFileName !== undefined ? { generatedFileName: params.generatedFileName } : {}),
      ...(params.generatedFileUrl !== undefined ? { generatedFileUrl: params.generatedFileUrl } : {}),
    }).where(eq(downtimeSummaries.id, summaryId));
  } else {
    const insertResult = await db.insert(downtimeSummaries).values({
      reportDate: params.reportDate,
      sourceReportId: params.sourceReportId,
      amExecutive: params.amExecutive,
      pmExecutive: params.pmExecutive,
      zoneBAmExecutive: params.zoneBAmExecutive || "",
      zoneBPmExecutive: params.zoneBPmExecutive || "",
      generatedFileName: params.generatedFileName ?? null,
      generatedFileUrl: params.generatedFileUrl ?? null,
    });
    summaryId = Number((insertResult as any)[0]?.insertId || (insertResult as any).insertId);
  }

  await db.delete(downtimeSummaryEntries).where(eq(downtimeSummaryEntries.summaryId, summaryId));
  if (params.entries.length) {
    await db.insert(downtimeSummaryEntries).values(params.entries.map((entry, index) => ({
      ...entry,
      summaryId,
      incidentOrder: index,
      status: entry.status || "Monitoring",
    })));
  }

  return getDowntimeSummaryByDate(params.reportDate);
}

export async function recordDowntimeSummaryImport(params: InsertDowntimeSummaryImport) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Requirement: whenever a new report is uploaded, override and delete the old import for this date
  await db.delete(downtimeSummaryImports).where(eq(downtimeSummaryImports.reportDate, params.reportDate));
  await db.insert(downtimeSummaryImports).values(params);
  return db.select().from(downtimeSummaryImports).where(eq(downtimeSummaryImports.reportDate, params.reportDate)).orderBy(desc(downtimeSummaryImports.createdAt));
}

export async function listDowntimeSummaryDrafts(reportDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(downtimeSummaryDrafts).where(eq(downtimeSummaryDrafts.reportDate, reportDate)).orderBy(downtimeSummaryDrafts.downtimeStart, downtimeSummaryDrafts.id);
}

export async function createDowntimeSummaryDraft(draft: InsertDowntimeSummaryDraft) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(downtimeSummaryDrafts).values(draft);
  return result;
}

export async function updateDowntimeSummaryDraft(id: number, draft: Partial<InsertDowntimeSummaryDraft>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(downtimeSummaryDrafts).set(draft).where(eq(downtimeSummaryDrafts.id, id));
  return db.select().from(downtimeSummaryDrafts).where(eq(downtimeSummaryDrafts.id, id)).limit(1);
}

export async function deleteDowntimeSummaryDraft(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(downtimeSummaryDrafts).where(eq(downtimeSummaryDrafts.id, id));
  return { success: true };
}
