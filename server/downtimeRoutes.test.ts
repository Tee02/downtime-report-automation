import express from "express";
import type { AddressInfo } from "node:net";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  combineMappedWorkbooks: vi.fn(),
  processDowntimeWorkbooks: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  createSavedDowntimeReport: vi.fn(),
  findSavedDowntimeReport: vi.fn(),
  getSavedDowntimeReportsByIds: vi.fn(),
  loadSavedDowntimeReports: vi.fn(),
}));

vi.mock("./downtimeProcessor", () => ({ combineMappedWorkbooks: mocks.combineMappedWorkbooks, processDowntimeWorkbooks: mocks.processDowntimeWorkbooks }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));
vi.mock("./db", () => ({ createSavedDowntimeReport: mocks.createSavedDowntimeReport, findSavedDowntimeReport: mocks.findSavedDowntimeReport, getSavedDowntimeReportsByIds: mocks.getSavedDowntimeReportsByIds }));
vi.mock("./downtimeAnalysis", () => ({ loadSavedDowntimeReports: mocks.loadSavedDowntimeReports }));

import { registerDowntimeRoutes } from "./downtimeRoutes";

const servers: Array<ReturnType<express.Express["listen"]>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.clearAllMocks();
});

describe("downtime analyze upload route", () => {
  it("forwards closures and weather text, then saves both files only when requested", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("data:application/octet-stream;base64,UEsDBBQAAAAIAAA=");
    mocks.findSavedDowntimeReport.mockResolvedValue(undefined);
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
      totalNetworkPercentage: 0, closedRideCount: 1, weatherIntervalCount: 2, fireAlarmCount: 0, totalEvacuationEvents: 0, summaryByRide: [], outputBuffer: readableWorkbook, outputFileName: "Technical_Downtime_2026-08-03.xlsx",
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
    expect(mocks.createSavedDowntimeReport).toHaveBeenCalledWith(expect.objectContaining({
      reportDate: "2026-08-03",
      sourceFileName: "downtime.xlsx",
      weatherIntervalCount: 2,
      weatherText: expect.stringContaining("Inclement Weather"),
    }));
    const download = await fetch(`http://127.0.0.1:${port}${body.downloadUrl}`);
    expect(download.status).toBe(200);
    const downloadedZip = await JSZip.loadAsync(Buffer.from(await download.arrayBuffer()));
    expect(Object.keys(downloadedZip.files)).toContain("xl/workbook.xml");
  });

  it("blocks a repeated report date before creating new retained files", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("data:application/octet-stream;base64,UEsDBBQAAAAIAAA=");
    mocks.findSavedDowntimeReport.mockResolvedValue({ id: 9 });
    mocks.processDowntimeWorkbooks.mockResolvedValue({ outputFileName: "Technical_Downtime_2026-08-03.xlsx" });
    const app = express();
    registerDowntimeRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const form = new FormData();
    form.append("operationsFile", new Blob(["sample workbook"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "renamed-downtime.xlsx");
    form.append("saveToStorage", "true");
    const response = await fetch(`http://127.0.0.1:${port}/api/downtime/analyze`, { method: "POST", body: form });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.stringContaining("already exists") }));
    expect(response.status).toBe(409);
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createSavedDowntimeReport).not.toHaveBeenCalled();
  });
});

describe("saved downtime mapping route", () => {
  it("sorts selected saved logs chronologically and returns one combined Mapping Excel", async () => {
    const later = { id: 2, reportDate: "2026-09-13", sourceFileName: "13.xlsx", sourceFileUrl: "/manus-storage/13.xlsx", outputFileName: "old-13.xlsx", outputFileUrl: "/manus-storage/old-13.xlsx", totalTechnicalMinutes: 139, totalNetworkPercentage: 1.5, weatherIntervalCount: 0, weatherText: null, createdAt: new Date() };
    const earlier = { id: 1, reportDate: "2026-09-12", sourceFileName: "12.xlsx", sourceFileUrl: "/manus-storage/12.xlsx", outputFileName: "old-12.xlsx", outputFileUrl: "/manus-storage/old-12.xlsx", totalTechnicalMinutes: 36, totalNetworkPercentage: 0.4, weatherIntervalCount: 0, weatherText: null, createdAt: new Date() };
    mocks.getSavedDowntimeReportsByIds.mockResolvedValue([later, earlier]);
    mocks.loadSavedDowntimeReports.mockImplementation(async (reports: typeof later[]) => reports.map(report => ({ report, buffer: Buffer.from(report.reportDate), records: [] })));
    mocks.processDowntimeWorkbooks
      .mockResolvedValueOnce({ records: [], matchedCount: 5, unmatchedCount: 0, totalTechnicalMinutes: 36, totalOperationsMinutes: 0, totalEvacuationMinutes: 0, totalEvacuationEvents: 0, totalNetworkPercentage: 0.4, closedRideCount: 0, weatherIntervalCount: 0, fireAlarmCount: 0, summaryByRide: [], outputBuffer: Buffer.from("mapped-12"), outputFileName: "Technical_Downtime_2026-09-12.xlsx" })
      .mockResolvedValueOnce({ records: [], matchedCount: 11, unmatchedCount: 0, totalTechnicalMinutes: 139, totalOperationsMinutes: 0, totalEvacuationMinutes: 0, totalEvacuationEvents: 0, totalNetworkPercentage: 1.5, closedRideCount: 0, weatherIntervalCount: 0, fireAlarmCount: 0, summaryByRide: [], outputBuffer: Buffer.from("mapped-13"), outputFileName: "Technical_Downtime_2026-09-13.xlsx" });
    mocks.combineMappedWorkbooks.mockResolvedValue(Buffer.from("combined workbook"));
    mocks.storagePut.mockResolvedValue({ key: "mapping.xlsx", url: "/manus-storage/mapping.xlsx" });

    const app = express();
    app.use(express.json());
    registerDowntimeRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/downtime/map-saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportIds: [2, 1], closedRideCodes: [] }),
    });
    const body = await response.json() as { sourceDates: string[]; outputFileName: string; matchedCount: number; downloadUrl: string };

    expect(response.status).toBe(200);
    expect(mocks.loadSavedDowntimeReports.mock.calls[0]?.[0].map((report: typeof later) => report.reportDate)).toEqual(["2026-09-12", "2026-09-13"]);
    expect(mocks.combineMappedWorkbooks).toHaveBeenCalledWith([
      { reportDate: "2026-09-12", buffer: Buffer.from("mapped-12") },
      { reportDate: "2026-09-13", buffer: Buffer.from("mapped-13") },
    ]);
    expect(body).toMatchObject({
      sourceDates: ["2026-09-12", "2026-09-13"],
      outputFileName: "Mapping_Excel_2026-09-12_to_2026-09-13.xlsx",
      matchedCount: 16,
      downloadUrl: "/manus-storage/mapping.xlsx",
    });
  });

  it("rejects more than one saved source for the same report date", async () => {
    mocks.getSavedDowntimeReportsByIds.mockResolvedValue([
      { id: 1, reportDate: "2026-09-12" },
      { id: 2, reportDate: "2026-09-12" },
    ]);
    const app = express();
    app.use(express.json());
    registerDowntimeRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/downtime/map-saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportIds: [1, 2] }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.stringContaining("one saved downtime log") }));
    expect(mocks.loadSavedDowntimeReports).not.toHaveBeenCalled();
  });
});
