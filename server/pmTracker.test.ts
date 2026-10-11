import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ZONE_A_RIDES, ZONE_B_RIDES, getRideZone } from "../client/src/data/pmTracker";
import ExcelJS from "exceljs";
import { buildPmTrackerWorkbook, EXCEL_CONTENT_TYPE } from "./pmTrackerExcel";

const mocks = vi.hoisted(() => ({
  listPmTrackerLogs: vi.fn(),
  createPmTrackerLog: vi.fn(),
  updatePmTrackerLog: vi.fn(),
  deletePmTrackerLog: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  listPmTrackerLogs: mocks.listPmTrackerLogs,
  createPmTrackerLog: mocks.createPmTrackerLog,
  updatePmTrackerLog: mocks.updatePmTrackerLog,
  deletePmTrackerLog: mocks.deletePmTrackerLog,
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
}));

import { appRouter } from "./routers";

describe("PM Tracker router and zone models", () => {
  const anonymousContext = { user: null } as TrpcContext;
  const caller = appRouter.createCaller(anonymousContext);

  it("assigns Genting SkyWorlds attractions strictly to Zone A and Zone B", () => {
    expect(getRideZone("BWZ")).toBe("Zone A");
    expect(getRideZone("AFP")).toBe("Zone A");
    expect(getRideZone("ESD")).toBe("Zone A");
    expect(getRideZone("IDD")).toBe("Zone A");
    expect(getRideZone("BCT (EV)")).toBe("Zone A");
    expect(getRideZone("NTM")).toBe("Zone A");
    expect(getRideZone("PTA")).toBe("Zone A");
    expect(getRideZone("RTR")).toBe("Zone A");
    expect(getRideZone("TTC")).toBe("Zone A");

    expect(getRideZone("ACR")).toBe("Zone B");
    expect(getRideZone("BSC")).toBe("Zone B");
    expect(getRideZone("EHF")).toBe("Zone B");
    expect(getRideZone("VTM")).toBe("Zone B");
    expect(getRideZone("ETI")).toBe("Zone B");
    expect(getRideZone("MFZ")).toBe("Zone B");
    expect(getRideZone("RCC")).toBe("Zone B");
    expect(getRideZone("SAG")).toBe("Zone B");
    expect(getRideZone("SRS")).toBe("Zone B");

    expect(ZONE_A_RIDES.length).toBe(12);
    expect(ZONE_B_RIDES.length).toBe(9);
    expect(ZONE_A_RIDES.length + ZONE_B_RIDES.length).toBe(21);
  });

  it("lists all recorded digital PM logs", async () => {
    const sample = [
      {
        id: 1,
        logDate: "2026-10-10",
        zone: "Zone A",
        rideCode: "BWZ",
        rideName: "Big Weld's Zeppelin",
        status: "Completed",
        workType: "Morning OT",
        technician: "Hafiz",
        summary: "RV2 sensor adjusted",
        message: "Morning OT 10/10: BWZ RV2 sensor adjusted, found bolt missing on platform gate.",
      },
    ];
    mocks.listPmTrackerLogs.mockResolvedValue(sample);

    const result = await caller.pmTracker.list();
    expect(result).toEqual(sample);
    expect(mocks.listPmTrackerLogs).toHaveBeenCalledOnce();
  });

  it("records a new digital log from pasted supervisor message", async () => {
    const input = {
      logDate: "2026-10-11",
      zone: "Zone B" as const,
      rideCode: "ACR",
      rideName: "Acorn Adventure",
      status: "Pending" as const,
      workType: "Weekly PM" as const,
      technician: "Adam",
      summary: "Missing bolt on platform gate yet to be replaced",
      message: "Closing finding: missing bolt on platform gate yet to be replaced during weekly PM.",
    };
    mocks.createPmTrackerLog.mockResolvedValue({ id: 2, ...input });

    const created = await caller.pmTracker.create(input);
    expect(created.id).toBe(2);
    expect(mocks.createPmTrackerLog).toHaveBeenCalledWith(input);
  });

  it("deletes a digital log by id", async () => {
    mocks.deletePmTrackerLog.mockResolvedValue({ success: true });
    const res = await caller.pmTracker.delete({ id: 2 });
    expect(res).toEqual({ success: true });
    expect(mocks.deletePmTrackerLog).toHaveBeenCalledWith(2);
  });

  it("builds and stores a real formatted PM Tracker .xlsx workbook", async () => {
    const log = {
      id: 3,
      logDate: "2026-10-11",
      zone: "Zone A",
      rideCode: "BWZ",
      rideName: "Big Weld's Zeppelin",
      status: "Completed",
      workType: "Night OT",
      technician: "Hafiz",
      summary: "RV2 sensor adjusted",
      message: "Night OT: RV2 sensor adjusted and platform gate bolt inspection completed.",
      createdAt: new Date("2026-10-11T11:00:00Z"),
      updatedAt: new Date("2026-10-11T11:00:00Z"),
    };

    const workbookBuffer = await buildPmTrackerWorkbook([log]);
    expect(workbookBuffer.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("PM Tracker Log");
    expect(sheet?.getCell("A1").value).toBe("PM TRACKER · DIGITAL RIDE MAINTENANCE LOGBOOK");
    expect(sheet?.getCell("A4").value).toBe("Log Date");
    expect(sheet?.getCell("C5").value).toBe("BWZ");
    expect(sheet?.getCell("I5").value).toContain("platform gate bolt");

    mocks.listPmTrackerLogs.mockResolvedValue([log]);
    mocks.storagePut.mockResolvedValue({ url: "/manus-storage/pm-tracker-export.xlsx" });
    const result = await caller.pmTracker.exportExcel({ zone: "Zone A" });

    expect(result).toEqual({
      fileName: expect.stringMatching(/^PM_Tracker_Zone_A_\d{8}\.xlsx$/),
      downloadUrl: "/manus-storage/pm-tracker-export.xlsx",
      logCount: 1,
    });
    expect(mocks.storagePut).toHaveBeenCalledWith(
      expect.stringContaining("pm-tracker-exports/"),
      expect.any(Buffer),
      EXCEL_CONTENT_TYPE
    );
  });
});
