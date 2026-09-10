import type { Express, Request, Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSavedDowntimeReport, findSavedDowntimeReport } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { processDowntimeWorkbooks } from "./downtimeProcessor";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.originalname.toLowerCase().endsWith(".xlsx"));
  },
});

const FIXED_TEMPLATE_KEY = "WK_template_v3_232fdd97.xlsx";

async function getFixedTemplate(): Promise<Buffer> {
  const localTemplatePath = path.resolve(process.cwd(), "templates", "WK_template_v3.xlsx");
  if (existsSync(localTemplatePath)) {
    try {
      return await readFile(localTemplatePath);
    } catch {
      // fallback to storage
    }
  }
  const signedUrl = await storageGetSignedUrl(FIXED_TEMPLATE_KEY);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("The fixed Technical template could not be retrieved. Please contact the report administrator.");
  return Buffer.from(await response.arrayBuffer());
}

function failure(response: Response, status: number, message: string) {
  return response.status(status).json({ error: message });
}

function parseManualClosures(value: unknown): string[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") throw new Error("The handover closure selection is invalid.");
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 24 || parsed.some(item => typeof item !== "string" || item.length > 50)) {
    throw new Error("The handover closure selection is invalid.");
  }
  return parsed;
}

function parseSavePreference(value: unknown): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("The save preference is invalid.");
}

function parseWeatherText(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 20_000) throw new Error("The weather message text is invalid.");
  return value;
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 180) || "downtime-log.xlsx";
}

export function registerDowntimeRoutes(app: Express) {
  app.post(
    "/api/downtime/analyze",
    upload.single("operationsFile"),
    async (request, response) => {
      const operationsFile = request.file;
      if (!operationsFile) return failure(response, 400, "Upload an Operations downtime XLSX file.");
      try {
        const manualClosedRideCodes = parseManualClosures(request.body.closedRideCodes);
        const weatherText = parseWeatherText(request.body.weatherText);
        const saveToStorage = parseSavePreference(request.body.saveToStorage);
        const result = await processDowntimeWorkbooks(operationsFile.buffer, await getFixedTemplate(), { manualClosedRideCodes, weatherText });
        const reportDate = /_(\d{4}-\d{2}-\d{2})\.xlsx$/i.exec(result.outputFileName)?.[1];
        if (!reportDate) throw new Error("The generated report date could not be saved.");
        if (saveToStorage && await findSavedDowntimeReport(reportDate)) {
          return failure(response, 409, `A saved report already exists for ${reportDate}. This workbook was not saved again to prevent a repeated report in the system.`);
        }
        const reportId = crypto.randomUUID();
        const stored = await storagePut(
          `downtime-reports/${reportId}/${result.outputFileName}`,
          result.outputBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        if (saveToStorage) {
          const source = await storagePut(
            `downtime-logs/${reportId}/${safeFileName(operationsFile.originalname)}`,
            operationsFile.buffer,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          await createSavedDowntimeReport({
            reportDate,
            sourceFileName: operationsFile.originalname,
            sourceFileUrl: source.url,
            outputFileName: result.outputFileName,
            outputFileUrl: stored.url,
            totalTechnicalMinutes: result.totalTechnicalMinutes,
            totalNetworkPercentage: result.totalNetworkPercentage,
            weatherIntervalCount: result.weatherIntervalCount,
            weatherText: weatherText?.trim() || result.weatherText || null,
          });
        }
        return response.json({
          ...result,
          outputBuffer: undefined,
          downloadUrl: stored.url,
          savedToLibrary: saveToStorage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The workbook could not be processed.";
        return failure(response, 422, message);
      }
    }
  );
}
