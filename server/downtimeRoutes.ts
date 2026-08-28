import type { Express, Request, Response } from "express";
import multer from "multer";
import { storageGetSignedUrl, storagePut } from "./storage";
import { processDowntimeWorkbooks } from "./downtimeProcessor";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.originalname.toLowerCase().endsWith(".xlsx"));
  },
});

const FIXED_TEMPLATE_KEY = "WK_template_v2_46a53c64.xlsx";

async function getFixedTemplate(): Promise<Buffer> {
  const signedUrl = await storageGetSignedUrl(FIXED_TEMPLATE_KEY);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("The fixed Technical template could not be retrieved. Please contact the report administrator.");
  return Buffer.from(await response.arrayBuffer());
}

function failure(response: Response, status: number, message: string) {
  return response.status(status).json({ error: message });
}

export function registerDowntimeRoutes(app: Express) {
  app.post(
    "/api/downtime/analyze",
    upload.single("operationsFile"),
    async (request, response) => {
      const operationsFile = request.file;
      if (!operationsFile) return failure(response, 400, "Upload an Operations downtime XLSX file.");
      try {
        const result = await processDowntimeWorkbooks(operationsFile.buffer, await getFixedTemplate());
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
