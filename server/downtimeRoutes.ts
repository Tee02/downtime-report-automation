import type { Express, Request, Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSavedDowntimeReport, findSavedDowntimeReport, getSavedDowntimeReportsByIds } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { combineMappedWorkbooks, processDowntimeWorkbooks, type ProcessingResult } from "./downtimeProcessor";
import { parseParkCloseTimesFromPdf } from "./parkCloseParser";
import { loadSavedDowntimeReports } from "./downtimeAnalysis";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: 20 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const name = file.originalname.toLowerCase();
    callback(null, name.endsWith(".xlsx") || name.endsWith(".pdf"));
  },
});

const summaryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 12 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const name = file.originalname.toLowerCase();
    const allowed = name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp") || name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc");
    callback(null, allowed);
  },
});

const FIXED_TEMPLATE_KEY = "WK_template_v4_74dd9c19.xlsx";

async function getFixedTemplate(): Promise<Buffer> {
  const localTemplatePath = path.resolve(process.cwd(), "templates", "WK_template_v4.xlsx");
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

function parseReportIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 60) {
    throw new Error("Select between 1 and 60 saved downtime logs.");
  }
  const ids = value.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error("The saved downtime log selection is invalid.");
  }
  return ids;
}

function combineProcessingResults(results: ProcessingResult[], reportDates: string[]) {
  const records = results
    .flatMap(result => result.records)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.sourceRow - right.sourceRow);
  const rideSummary = new Map<string, ProcessingResult["summaryByRide"][number]>();
  results.flatMap(result => result.summaryByRide).forEach(item => {
    const current = rideSummary.get(item.rideCode) ?? { ...item, minutes: 0, events: 0, evacuationMinutes: 0, percentage: 0, isClosed: false };
    current.minutes += item.minutes;
    current.events += item.events;
    current.evacuationMinutes += item.evacuationMinutes;
    current.percentage = (current.minutes / (480 * reportDates.length)) * 100;
    current.isClosed ||= item.isClosed;
    rideSummary.set(item.rideCode, current);
  });
  const totalTechnicalMinutes = results.reduce((sum, result) => sum + result.totalTechnicalMinutes, 0);
  return {
    records,
    matchedCount: results.reduce((sum, result) => sum + result.matchedCount, 0),
    unmatchedCount: results.reduce((sum, result) => sum + result.unmatchedCount, 0),
    totalTechnicalMinutes,
    totalOperationsMinutes: results.reduce((sum, result) => sum + result.totalOperationsMinutes, 0),
    totalEvacuationMinutes: results.reduce((sum, result) => sum + result.totalEvacuationMinutes, 0),
    totalEvacuationEvents: results.reduce((sum, result) => sum + result.totalEvacuationEvents, 0),
    totalNetworkPercentage: (totalTechnicalMinutes / (480 * 19 * reportDates.length)) * 100,
    closedRideCount: results.reduce((sum, result) => sum + result.closedRideCount, 0),
    weatherIntervalCount: results.reduce((sum, result) => sum + result.weatherIntervalCount, 0),
    fireAlarmCount: results.reduce((sum, result) => sum + result.fireAlarmCount, 0),
    summaryByRide: Array.from(rideSummary.values()).sort((left, right) => right.minutes - left.minutes),
    dailySummary: results.map((result, index) => ({
      dateKey: reportDates[index]!,
      technicalMinutes: result.totalTechnicalMinutes,
      incidents: result.matchedCount,
      downtimePercentage: result.totalNetworkPercentage,
    })),
  };
}

export function registerDowntimeRoutes(app: Express) {
  app.post("/api/downtime/summary-upload", summaryUpload.single("file"), async (request, response) => {
    const file = request.file;
    if (!file) return failure(response, 400, "Choose an image, PDF, or Word file to upload.");
    try {
      const safeName = safeFileName(file.originalname);
      const stored = await storagePut(
        `downtime-summary-attachments/${crypto.randomUUID()}/${safeName}`,
        file.buffer,
        file.mimetype || "application/octet-stream"
      );
      return response.json({
        fileName: file.originalname,
        fileUrl: stored.url,
        fileType: file.mimetype || "application/octet-stream",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The attachment could not be uploaded.";
      return failure(response, 422, message);
    }
  });

  app.post(
    "/api/downtime/analyze",
    upload.fields([
      { name: "operationsFile", maxCount: 1 },
      { name: "parkCloseFile", maxCount: 1 },
    ]),
    async (request, response) => {
      const files = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const operationsFile = files?.["operationsFile"]?.[0] || request.file;
      const parkCloseFile = files?.["parkCloseFile"]?.[0];
      if (!operationsFile) return failure(response, 400, "Upload an Operations downtime XLSX file.");
      try {
        const manualClosedRideCodes = parseManualClosures(request.body.closedRideCodes);
        const weatherText = parseWeatherText(request.body.weatherText);
        // User requirement: Every uploaded daily log is automatically saved to the website library
        // Existing logs for the same date are skipped/not duplicated rather than dropping the whole save.
        const savePreferenceParam = request.body.saveToStorage;
        const saveToStorage = savePreferenceParam === undefined || savePreferenceParam === "" || savePreferenceParam === "true";
        let parkCloseTimes: Record<string, string> | undefined;
        if (parkCloseFile) {
          try {
            parkCloseTimes = await parseParkCloseTimesFromPdf(parkCloseFile.buffer);
          } catch (err) {
            console.warn("Failed to parse 10-7 park close PDF:", err);
          }
        }
        const result = await processDowntimeWorkbooks(operationsFile.buffer, await getFixedTemplate(), { manualClosedRideCodes, weatherText, parkCloseTimes });
        const reportDate = /_(\d{4}-\d{2}-\d{2})\.xlsx$/i.exec(result.outputFileName)?.[1];
        if (!reportDate) throw new Error("The generated report date could not be saved.");
        const existingReport = await findSavedDowntimeReport(reportDate);
        const shouldSaveReport = saveToStorage && !existingReport;
        const reportId = crypto.randomUUID();
        const stored = await storagePut(
          `downtime-reports/${reportId}/${result.outputFileName}`,
          result.outputBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        if (shouldSaveReport) {
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
          parkCloseMappedCount: parkCloseTimes ? Object.keys(parkCloseTimes).filter(k => parkCloseTimes![k] !== "CLOSED").length : 0,
          parkCloseTimes,
          outputBuffer: undefined,
          downloadUrl: stored.url,
          savedToLibrary: shouldSaveReport,
          alreadyExisted: Boolean(existingReport),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The workbook could not be processed.";
        return failure(response, 422, message);
      }
    }
  );

  app.post("/api/downtime/map-saved", async (request: Request, response: Response) => {
    try {
      const reportIds = parseReportIds(request.body.reportIds);
      const manualClosedRideCodes = parseManualClosures(JSON.stringify(request.body.closedRideCodes ?? []));
      const weatherText = parseWeatherText(request.body.weatherText);
      const reports = (await getSavedDowntimeReportsByIds(reportIds))
        .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
      if (reports.length !== reportIds.length) {
        return failure(response, 404, "One or more selected saved downtime logs are no longer available. Refresh the calendar and try again.");
      }
      if (new Set(reports.map(report => report.reportDate)).size !== reports.length) {
        return failure(response, 422, "Choose only one saved downtime log for each report date.");
      }

      const loadedReports = await loadSavedDowntimeReports(reports);
      const templateBuffer = await getFixedTemplate();
      const results: ProcessingResult[] = [];
      for (const loaded of loadedReports) {
        const savedWeatherText = loaded.report.weatherText?.trim();
        const combinedWeatherText = [savedWeatherText, reports.length === 1 ? weatherText?.trim() : undefined]
          .filter((value): value is string => Boolean(value))
          .join("\n");
        results.push(await processDowntimeWorkbooks(loaded.buffer, templateBuffer, {
          manualClosedRideCodes,
          weatherText: combinedWeatherText || undefined,
        }));
      }

      const reportDates = loadedReports.map(item => item.report.reportDate);
      const outputBuffer = await combineMappedWorkbooks(results.map((result, index) => ({
        reportDate: reportDates[index]!,
        buffer: result.outputBuffer,
      })));
      const firstDate = reportDates[0]!;
      const lastDate = reportDates.at(-1)!;
      const outputFileName = firstDate === lastDate
        ? `Mapping_Excel_${firstDate}.xlsx`
        : `Mapping_Excel_${firstDate}_to_${lastDate}.xlsx`;
      const stored = await storagePut(
        `mapping-excels/${crypto.randomUUID()}/${outputFileName}`,
        outputBuffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const combined = combineProcessingResults(results, reportDates);

      return response.json({
        ...combined,
        outputFileName,
        downloadUrl: stored.url,
        sourceMode: "saved",
        sourceDates: reportDates,
        sourceFiles: loadedReports.map(item => ({
          id: item.report.id,
          reportDate: item.report.reportDate,
          fileName: item.report.sourceFileName,
          url: item.report.sourceFileUrl,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The saved downtime logs could not be mapped.";
      return failure(response, 422, message);
    }
  });
}
