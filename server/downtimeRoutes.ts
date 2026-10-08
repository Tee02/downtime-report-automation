import type { Express, Request, Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSavedDowntimeReportsByIds, replaceSavedDowntimeReport, saveAnalysisDailySnapshot } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { combineMappedWorkbooks, processDowntimeWorkbooks, type ProcessingResult } from "./downtimeProcessor";
import { parseParkCloseTimesFromPdf } from "./parkCloseParser";
import { loadSavedDowntimeReports } from "./downtimeAnalysis";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { Document as DocxDocument, Packer as DocxPacker, Paragraph as DocxParagraph, TextRun as DocxTextRun } from "docx";

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

async function extractDocumentText(fileName: string, buffer: Buffer): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) return "";
      return xml
        .replace(/<w:p[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
    } catch (e) {
      console.warn("Failed to extract docx text:", e);
      return "";
    }
  }
  if (lower.endsWith(".pdf")) {
    try {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      const pagesText: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const strings = content.items
          .map((item: any) => (item.str || "").trim())
          .filter(Boolean);
        if (strings.length) pagesText.push(strings.join(" "));
      }
      return pagesText.join("\n\n").trim();
    } catch (e) {
      console.warn("Failed to extract pdf text:", e);
      return "";
    }
  }
  return "";
}

export type MatchedSummaryField = {
  reportDate?: string;
  rideCode: string;
  description?: string;
  downtimeStart?: string;
  downtimeEnd?: string;
  durationMinutes?: number;
  recurringDowntime?: "Yes" | "No";
  recurringDowntimeDays?: string;
  incident?: "Yes" | "No";
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  followUpAction?: string;
};

export function parseSummaryIncidentsFromText(text: string): MatchedSummaryField[] {
  const results: MatchedSummaryField[] = [];
  // Split into chunks by Ride/Attraction or Date markers
  const chunks = text.split(/(?:Ride\/Attraction|Attraction\s*:)/i);
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Look for ride code: first token or line
    const rideMatch = /^\s*[:\s]*([A-Z0-9()\s-]+?)(?:\s+(?:Executive|Date|Recurring|Downtime|Incident|Time)|$|\n)/i.exec(chunk);
    const rideRaw = (rideMatch?.[1] || "").trim().toUpperCase();
    if (!rideRaw) continue;

    // Normalize known ride codes
    let rideCode = rideRaw;
    if (rideCode.includes("POTA") || rideCode.includes("PLANET OF THE APES")) rideCode = "PTA";
    else if (rideCode.includes("TRICK COASTER")) rideCode = "BCT (ZC)";
    else if (rideCode.includes("TERRAFORM")) rideCode = "TTC";
    else if (rideCode.includes("BIGWELD")) rideCode = "BWZ";
    else if (rideCode.includes("ACORN")) rideCode = "ACR";
    else if (rideCode.includes("MAMMOTH")) rideCode = "MFZ";
    else if (rideCode.includes("ALPHA FIGHTER")) rideCode = "AFP";
    else {
      const firstWord = rideCode.split(/\s+/)[0];
      if (firstWord && firstWord.length <= 8) rideCode = firstWord;
    }

    // Time Down / Time Up
    const downMatch = /Time Down\s*[:\s]*(\d{2}:?\d{2})/i.exec(chunk);
    const upMatch = /Time Up\s*[:\s]*(\d{2}:?\d{2})/i.exec(chunk);
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (downMatch) {
      const raw = downMatch[1].replace(":", "");
      startTime = raw.length === 4 ? `${raw.slice(0, 2)}:${raw.slice(2)}` : downMatch[1];
    }
    if (upMatch) {
      const raw = upMatch[1].replace(":", "");
      endTime = raw.length === 4 ? `${raw.slice(0, 2)}:${raw.slice(2)}` : upMatch[1];
    }

    // Duration
    const durMatch = /Duration\s*(?:of Downtime)?\s*[:\s]*(\d+)\s*min/i.exec(chunk);
    const durationMinutes = durMatch ? parseInt(durMatch[1], 10) : undefined;

    // Downtime description is required for safe matching with the web archive.
    const descriptionMatch = /Downtime Description(?:\s*\([^)]*\))?\s*[:\s]*([\s\S]*?)(?=(?:Time Down|Time Up|Duration|Root Cause|Corrective Action|Preventive Action|$))/i.exec(chunk);
    const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;

    // Recurring Downtime & Incident
    const recurringMatch = /Recurring Downtime[\s\S]*?(?:(☑|✓|\[x\]|Yes)\s*Yes|(☑|✓|\[x\]|No)\s*No)/i.exec(chunk);
    let recurringDowntime: "Yes" | "No" = "No";
    if (recurringMatch) {
      if (recurringMatch[1]) recurringDowntime = "Yes";
      else if (recurringMatch[2]) recurringDowntime = "No";
    }
    const recDaysMatch = /Downtime No\. of Day[^\n:]*[:\s]*([^\n]+)/i.exec(chunk);
    const recurringDowntimeDays = recDaysMatch ? recDaysMatch[1].trim() : undefined;

    const incidentMatch = /\bIncident[\s\S]*?(?:(☑|✓|\[x\])\s*Yes|(☑|✓|\[x\])\s*No)/i.exec(chunk);
    let incident: "Yes" | "No" = "No";
    if (incidentMatch) {
      if (incidentMatch[1]) incident = "Yes";
      else if (incidentMatch[2]) incident = "No";
    }

    // Root cause, corrective, preventive
    const rootMatch = /Root Cause\(s\)\s*[:\s]*([\s\S]*?)(?=(?:Corrective Action|Preventive Action|Part\(s\)|ANR|Status|$))/i.exec(chunk);
    const corrMatch = /Corrective Action\s*[:\s]*([\s\S]*?)(?=(?:Preventive Action|Part\(s\)|Follow-Up|ANR|Status|$))/i.exec(chunk);
    const prevMatch = /Preventive Action\s*[:\s]*([\s\S]*?)(?=(?:Part\(s\)|Follow-Up|ANR|Other Supporting|Status|$))/i.exec(chunk);
    const followUpMatch = /Follow-Up Action(?:\s*\(if any\))?\s*[:\s]*([\s\S]*?)(?=(?:ANR|Other Supporting|Status|$))/i.exec(chunk);

    results.push({
      rideCode,
      description,
      downtimeStart: startTime,
      downtimeEnd: endTime,
      durationMinutes,
      recurringDowntime,
      recurringDowntimeDays,
      incident,
      rootCause: rootMatch ? rootMatch[1].trim() : undefined,
      correctiveAction: corrMatch ? corrMatch[1].trim() : undefined,
      preventiveAction: prevMatch ? prevMatch[1].trim() : undefined,
      followUpAction: followUpMatch ? followUpMatch[1].trim() : undefined,
    });
  }
  return results;
}

async function convertPdfToDocxBuffer(pdfText: string): Promise<Buffer> {
  const paragraphs: DocxParagraph[] = [];
  for (const line of pdfText.split("\n")) {
    paragraphs.push(
      new DocxParagraph({
        spacing: { before: 20, after: 20 },
        children: [
          new DocxTextRun({
            text: line,
            font: "Calibri",
            size: 20,
          }),
        ],
      })
    );
  }
  const doc = new DocxDocument({
    sections: [
      {
        children: paragraphs.length > 0 ? paragraphs : [new DocxParagraph({ text: "Empty document" })],
      },
    ],
  });
  return await DocxPacker.toBuffer(doc);
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
      const extractedText = await extractDocumentText(file.originalname, file.buffer);
      let convertedDocxFileName: string | null = null;
      let convertedDocxUrl: string | null = null;
      if (file.originalname.toLowerCase().endsWith(".pdf")) {
        const docxBuf = await convertPdfToDocxBuffer(extractedText || "PDF document imported without text.");
        const convertedName = safeName.replace(/\.pdf$/i, ".docx");
        const convertedStored = await storagePut(
          `downtime-summary-attachments/${crypto.randomUUID()}/${convertedName}`,
          docxBuf,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        convertedDocxFileName = convertedName;
        convertedDocxUrl = convertedStored.url;
      }

      const matched = extractedText ? parseSummaryIncidentsFromText(extractedText) : [];

      return response.json({
        fileName: file.originalname,
        fileUrl: stored.url,
        fileType: file.mimetype || "application/octet-stream",
        extractedText: extractedText || null,
        convertedDocxFileName,
        convertedDocxUrl,
        matchedEntries: matched.length > 0 ? JSON.stringify(matched) : null,
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
        // Every uploaded daily log is saved to the website library. Re-uploads for
        // the same operational date replace the saved source instead of producing
        // duplicate or stale saved logs.
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
        const reportId = crypto.randomUUID();
        const stored = await storagePut(
          `downtime-reports/${reportId}/${result.outputFileName}`,
          result.outputBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        let replacedExisting = false;
        if (saveToStorage) {
          const source = await storagePut(
            `downtime-logs/${reportId}/${safeFileName(operationsFile.originalname)}`,
            operationsFile.buffer,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          const replacement = await replaceSavedDowntimeReport({
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
          replacedExisting = replacement.replacedExisting;

          // Store a compact immutable snapshot of daily KPIs and per-ride technical metrics
          try {
            const snapshot = {
              reportDate,
              totalTechnicalMinutes: result.totalTechnicalMinutes,
              totalEvents: result.records.filter(r => !r.isClosed && !r.isFireAlarm).length,
              totalNetworkPercentage: result.totalNetworkPercentage,
              rides: result.summaryByRide.map(r => ({
                rideCode: r.rideCode,
                minutes: r.minutes,
                events: r.events,
                percentage: r.percentage,
              })),
            };
            await saveAnalysisDailySnapshot({
              reportDate,
              snapshotJson: JSON.stringify(snapshot),
            });
          } catch (snapshotErr) {
            console.warn("Failed to store daily analysis snapshot:", snapshotErr);
          }
        }
        return response.json({
          ...result,
          parkCloseMappedCount: parkCloseTimes ? Object.keys(parkCloseTimes).filter(k => parkCloseTimes![k] !== "CLOSED").length : 0,
          parkCloseTimes,
          outputBuffer: undefined,
          downloadUrl: stored.url,
          savedToLibrary: saveToStorage,
          replacedExisting,
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
