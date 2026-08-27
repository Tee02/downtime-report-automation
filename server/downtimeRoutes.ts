import type { Express, Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { processDowntimeWorkbooks } from "./downtimeProcessor";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.originalname.toLowerCase().endsWith(".xlsx"));
  },
});

function readFile(request: Request, field: string): Express.Multer.File | undefined {
  const files = request.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

function failure(response: Response, status: number, message: string) {
  return response.status(status).json({ error: message });
}

export function registerDowntimeRoutes(app: Express) {
  app.post(
    "/api/downtime/analyze",
    upload.fields([
      { name: "operationsFile", maxCount: 1 },
      { name: "templateFile", maxCount: 1 },
    ]),
    async (request, response) => {
      const operationsFile = readFile(request, "operationsFile");
      const templateFile = readFile(request, "templateFile");
      if (!operationsFile || !templateFile) return failure(response, 400, "Upload one Operations downtime XLSX file and one Technical template XLSX file.");
      try {
        const result = await processDowntimeWorkbooks(operationsFile.buffer, templateFile.buffer);
        const stored = await storagePut(
          `downtime-reports/${crypto.randomUUID()}/${result.outputFileName}`,
          result.outputBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        return response.json({
          ...result,
          outputBuffer: undefined,
          downloadUrl: stored.url,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The workbook could not be processed.";
        return failure(response, 422, message);
      }
    }
  );
}
