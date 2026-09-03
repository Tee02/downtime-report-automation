import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ listSavedDowntimeReports: vi.fn(), deleteSavedDowntimeReport: vi.fn(), getSavedDowntimeReportsByIds: vi.fn() }));

vi.mock("./db", () => ({ listSavedDowntimeReports: mocks.listSavedDowntimeReports, deleteSavedDowntimeReport: mocks.deleteSavedDowntimeReport, getSavedDowntimeReportsByIds: mocks.getSavedDowntimeReportsByIds }));

import { appRouter } from "./routers";

describe("savedReports.list", () => {
  const context = { user: { id: 1, openId: "operator", role: "user" } } as TrpcContext;

  it("returns the saved-report library from the persistence helper", async () => {
    const reports = [{ id: 1, reportDate: "2026-09-03", sourceFileName: "downtime.xlsx" }];
    mocks.listSavedDowntimeReports.mockResolvedValue(reports);
    const caller = appRouter.createCaller(context);

    await expect(caller.savedReports.list()).resolves.toEqual(reports);
    expect(mocks.listSavedDowntimeReports).toHaveBeenCalledOnce();
  });

  it("removes a saved report from the library when the user confirms deletion", async () => {
    const caller = appRouter.createCaller(context);

    await expect(caller.savedReports.delete({ id: 7 })).resolves.toEqual({ success: true });
    expect(mocks.deleteSavedDowntimeReport).toHaveBeenCalledWith(7);
  });
});
