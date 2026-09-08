import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertSavedDowntimeReport, InsertUser, darkDays, savedDowntimeReports, siteContent, users } from "../drizzle/schema";
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

export async function setSiteContent(contentKey: string, contentValue: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("The database is temporarily unavailable.");
  await db.insert(siteContent).values({ contentKey, contentValue }).onDuplicateKeyUpdate({
    set: { contentValue },
  });
}
