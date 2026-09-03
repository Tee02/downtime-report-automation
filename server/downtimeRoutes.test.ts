import express from "express";
import type { AddressInfo } from "node:net";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processDowntimeWorkbooks: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  createSavedDowntimeReport: vi.fn(),
}));

vi.mock("./downtimeProcessor", () => ({ processDowntimeWorkbooks: mocks.processDowntimeWorkbooks }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));
vi.mock("./db", () => ({ createSavedDowntimeReport: mocks.createSavedDowntimeReport }));

import { registerDowntimeRoutes } from "./downtimeRoutes";

const servers: Array<ReturnType<express.Express["listen"]>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.clearAllMocks();
});

describe("downtime analyze upload route", () => {
  it("forwards closures and weather text, then saves both files only when requested", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("data:application/octet-stream;base64,UEsDBBQAAAAIAAA=");
    const readableWorkbook = await new JSZip().file("xl/workbook.xml", "<workbook/>").generateAsync({ type: "nodebuffer" });
    let storedWorkbook = Buffer.alloc(0);
    mocks.storagePut.mockImplementation(async (key: string, data: Buffer) => {
      if (key.startsWith("downtime-reports/")) {
        storedWorkbook = data;
        return { key: "downtime-reports/sample.xlsx", url: "/manus-storage/downtime-reports/sample.xlsx" };
      }
      return { key: "downtime-logs/source.xlsx", url: "/manus-storage/downtime-logs/source.xlsx" };
    });
    mocks.processDowntimeWorkbooks.mockResolvedValue({
      records: [], matchedCount: 0, unmatchedCount: 0, totalTechnicalMinutes: 0, totalOperationsMinutes: 0, totalEvacuationMinutes: 0,
      totalNetworkPercentage: 0, closedRideCount: 1, weatherIntervalCount: 2, summaryByRide: [], outputBuffer: readableWorkbook, outputFileName: "Technical_Downtime_2026-08-03.xlsx",
    });
    const app = express();
    registerDowntimeRoutes(app);
    app.get("/manus-storage/*", (_request, response) => response.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(storedWorkbook));
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const form = new FormData();
    form.append("operationsFile", new Blob(["sample workbook"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "downtime.xlsx");
    form.append("closedRideCodes", JSON.stringify(["NATM"]));
    form.append("weatherText", "VTM - 11-3: Inclement Weather @1515H\n11-8: @1626H");
    form.append("saveToStorage", "true");

    const response = await fetch(`http://127.0.0.1:${port}/api/downtime/analyze`, { method: "POST", body: form });
    const body = await response.json() as { downloadUrl: string; outputBuffer?: unknown };

    expect(response.status).toBe(200);
    expect(mocks.processDowntimeWorkbooks).toHaveBeenCalledTimes(1);
    const options = mocks.processDowntimeWorkbooks.mock.calls[0]?.[2] as { manualClosedRideCodes?: string[]; weatherText?: string };
    expect(options.manualClosedRideCodes).toEqual(["NATM"]);
    expect(options.weatherText?.replace(/\r\n/g, "\n")).toBe("VTM - 11-3: Inclement Weather @1515H\n11-8: @1626H");
    expect(body.downloadUrl).toBe("/manus-storage/downtime-reports/sample.xlsx");
    expect(body.outputBuffer).toBeUndefined();
    expect(mocks.storagePut).toHaveBeenCalledTimes(2);
    expect(mocks.createSavedDowntimeReport).toHaveBeenCalledWith(expect.objectContaining({ reportDate: "2026-08-03", sourceFileName: "downtime.xlsx", weatherIntervalCount: 2 }));
    const download = await fetch(`http://127.0.0.1:${port}${body.downloadUrl}`);
    expect(download.status).toBe(200);
    const downloadedZip = await JSZip.loadAsync(Buffer.from(await download.arrayBuffer()));
    expect(Object.keys(downloadedZip.files)).toContain("xl/workbook.xml");
  });
});
