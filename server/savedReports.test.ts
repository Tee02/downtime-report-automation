import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ listSavedDowntimeReports: vi.fn() }));

vi.mock("./db", () => ({ listSavedDowntimeReports: mocks.listSavedDowntimeReports }));

import { appRouter } from "./routers";

describe("savedReports.list", () => {
  it("returns the saved-report library from the persistence helper", async () => {
    const reports = [{ id: 1, reportDate: "2026-09-03", sourceFileName: "downtime.xlsx" }];
    mocks.listSavedDowntimeReports.mockResolvedValue(reports);
    const caller = appRouter.createCaller({} as TrpcContext);

    await expect(caller.savedReports.list()).resolves.toEqual(reports);
    expect(mocks.listSavedDowntimeReports).toHaveBeenCalledOnce();
  });
});
