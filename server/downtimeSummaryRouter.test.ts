import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createDowntimeSummaryDraft: vi.fn(),
  deleteSavedDowntimeReport: vi.fn(),
  deleteDowntimeSummaryDraft: vi.fn(),
  getDowntimeSummaryByDate: vi.fn(),
  getSavedDowntimeReportsByIds: vi.fn(),
  getSiteContent: vi.fn(),
  listAllDowntimeSummaryDates: vi.fn(),
  listAllSiteContent: vi.fn(),
  listDarkDays: vi.fn(),
  listSavedDowntimeReports: vi.fn(),
  recordDowntimeSummaryImport: vi.fn(),
  saveDowntimeSummaryState: vi.fn(),
  setDarkDay: vi.fn(),
  setSiteContent: vi.fn(),
  upsertUser: vi.fn(),
  storagePut: vi.fn(),
  updateDowntimeSummaryDraft: vi.fn(),
}));

vi.mock("./db", () => ({
  createDowntimeSummaryDraft: mocks.createDowntimeSummaryDraft,
  deleteSavedDowntimeReport: mocks.deleteSavedDowntimeReport,
  deleteDowntimeSummaryDraft: mocks.deleteDowntimeSummaryDraft,
  getDowntimeSummaryByDate: mocks.getDowntimeSummaryByDate,
  getSavedDowntimeReportsByIds: mocks.getSavedDowntimeReportsByIds,
  getSiteContent: mocks.getSiteContent,
  listAllDowntimeSummaryDates: mocks.listAllDowntimeSummaryDates,
  listAllSiteContent: mocks.listAllSiteContent,
  listDarkDays: mocks.listDarkDays,
  listSavedDowntimeReports: mocks.listSavedDowntimeReports,
  recordDowntimeSummaryImport: mocks.recordDowntimeSummaryImport,
  saveDowntimeSummaryState: mocks.saveDowntimeSummaryState,
  setDarkDay: mocks.setDarkDay,
  setSiteContent: mocks.setSiteContent,
  updateDowntimeSummaryDraft: mocks.updateDowntimeSummaryDraft,
  upsertUser: mocks.upsertUser,
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
}));

import { appRouter } from "./routers";

const entry = {
  incidentKey: "technical-2026-10-01-12-ACR",
  zone: "Zone A",
  rideCode: "ACR",
  attraction: "Acorn Adventure",
  description: "No Fault Registered on HMI Panel",
  downtimeStart: "10:37",
  downtimeEnd: "11:06",
  durationMinutes: 29,
  shift: "AM",
  recurringDowntime: "Yes" as const,
  recurringDowntimeDays: "2",
  incident: "No" as const,
  rootCause: "Restraint limit switch required adjustment.",
  correctiveAction: "Verified and adjusted the restraint.",
  preventiveAction: "Inspect switch condition during PM.",
  partsReplaced: "N/A",
  followUpAction: "N/A",
  anrNo: "N/A",
  supportInfo: "No supporting photo.",
  status: "Monitoring",
};

describe("downtimeSummary router", () => {
  const caller = appRouter.createCaller({ user: null } as TrpcContext);

  it("saves only the approved editable fields while leaving mapped incident values intact", async () => {
    mocks.saveDowntimeSummaryState.mockResolvedValue({ summary: { id: 5 }, entries: [entry] });

    await expect(
      caller.downtimeSummary.save({
        reportDate: "2026-10-01",
        sourceReportId: 88,
        amExecutive: "Firdaus, Adam",
        pmExecutive: "Yik Seng",
        zoneBAmExecutive: "Kamal",
        zoneBPmExecutive: "Rajesh",
        entries: [entry],
      })
    ).resolves.toEqual({ summary: { id: 5 }, entries: [entry] });

    expect(mocks.saveDowntimeSummaryState).toHaveBeenCalledWith(expect.objectContaining({
      reportDate: "2026-10-01",
      sourceReportId: 88,
      amExecutive: "Firdaus, Adam",
      pmExecutive: "Yik Seng",
      zoneBAmExecutive: "Kamal",
      zoneBPmExecutive: "Rajesh",
      entries: [expect.objectContaining({
        rideCode: "ACR",
        downtimeStart: "10:37",
        durationMinutes: 29,
        recurringDowntime: "Yes",
        recurringDowntimeDays: "2",
        incident: "No",
        status: "Monitoring",
      })],
    }));
  });

  it("generates and archives a DOCX report after saving the same daily state", async () => {
    mocks.storagePut.mockResolvedValue({ url: "/manus-storage/downtime-summaries/report.docx" });
    mocks.saveDowntimeSummaryState.mockResolvedValue({ summary: { id: 5 }, entries: [entry] });

    const result = await caller.downtimeSummary.generateDocx({
      reportDate: "2026-10-01",
      sourceReportId: 88,
      amExecutive: "Firdaus, Adam",
      pmExecutive: "Yik Seng",
      entries: [entry],
    });

    expect(result.fileName).toBe("DailyDowntimeSummaryReport-20261001.docx");
    expect(result.downloadUrl).toBe("/manus-storage/downtime-summaries/report.docx");
    expect(mocks.storagePut).toHaveBeenCalledWith(
      expect.stringContaining("downtime-summaries/"),
      expect.any(Buffer),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(mocks.saveDowntimeSummaryState).toHaveBeenCalledWith(expect.objectContaining({
      generatedFileName: "DailyDowntimeSummaryReport-20261001.docx",
      generatedFileUrl: "/manus-storage/downtime-summaries/report.docx",
    }));
  });

  it("persists follow-up action when creating and editing shift handover drafts", async () => {
    mocks.createDowntimeSummaryDraft.mockResolvedValue({ insertId: 3 });
    mocks.updateDowntimeSummaryDraft.mockResolvedValue([{ id: 3, followUpAction: "Inspect on next dark day." }]);

    await caller.downtimeSummary.createDraft({
      reportDate: "2026-10-01",
      zone: "Zone B",
      rideCode: "BWZ",
      attraction: "Big Weld's Zeppelin",
      description: "Joystick concern",
      downtimeStart: "16:44",
      downtimeEnd: "16:48",
      durationMinutes: 4,
      rootCause: "Joystick broken.",
      correctiveAction: "1. Disabled RV3.",
      preventiveAction: "1. Verify joystick during PM.",
      followUpAction: "Inspect on next dark day.",
    });

    expect(mocks.createDowntimeSummaryDraft).toHaveBeenCalledWith(expect.objectContaining({
      zone: "Zone B",
      rideCode: "BWZ",
      followUpAction: "Inspect on next dark day.",
    }));

    await caller.downtimeSummary.updateDraft({
      id: 3,
      followUpAction: "Replace joystick at the next dark day.",
    });

    expect(mocks.updateDowntimeSummaryDraft).toHaveBeenCalledWith(3, {
      followUpAction: "Replace joystick at the next dark day.",
    });
  });
});
