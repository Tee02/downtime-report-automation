import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  listSavedDowntimeReports: vi.fn(),
  deleteSavedDowntimeReport: vi.fn(),
  getSavedDowntimeReportsByIds: vi.fn(),
  listDarkDays: vi.fn(),
  setDarkDay: vi.fn(),
  upsertUser: vi.fn(),
  getSiteContent: vi.fn(),
  setSiteContent: vi.fn(),
}));

vi.mock("./db", () => ({
  listSavedDowntimeReports: mocks.listSavedDowntimeReports,
  deleteSavedDowntimeReport: mocks.deleteSavedDowntimeReport,
  getSavedDowntimeReportsByIds: mocks.getSavedDowntimeReportsByIds,
  listDarkDays: mocks.listDarkDays,
  setDarkDay: mocks.setDarkDay,
  upsertUser: mocks.upsertUser,
  getSiteContent: mocks.getSiteContent,
  setSiteContent: mocks.setSiteContent,
}));

import { appRouter } from "./routers";

describe("savedReports and darkDays routers", () => {
  const context = { user: { id: 1, openId: "operator", role: "user" } } as TrpcContext;
  const anonymousContext = { user: null } as TrpcContext;

  it("returns the saved-report library from the persistence helper", async () => {
    const reports = [{ id: 1, reportDate: "2026-09-03", sourceFileName: "downtime.xlsx" }];
    mocks.listSavedDowntimeReports.mockResolvedValue(reports);
    const caller = appRouter.createCaller(anonymousContext);

    await expect(caller.savedReports.list()).resolves.toEqual(reports);
    expect(mocks.listSavedDowntimeReports).toHaveBeenCalledOnce();
  });

  it("removes a saved report when an authenticated user confirms deletion", async () => {
    const caller = appRouter.createCaller(context);

    await expect(caller.savedReports.delete({ id: 7 })).resolves.toEqual({ success: true });
    expect(mocks.deleteSavedDowntimeReport).toHaveBeenCalledWith(7);
  });

  it("rejects anonymous deletion while anonymous browsing remains available", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.savedReports.delete({ id: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("supports listing and setting dark days", async () => {
    mocks.listDarkDays.mockResolvedValue(["2026-09-01"]);
    mocks.setDarkDay.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(anonymousContext);

    await expect(caller.darkDays.list()).resolves.toEqual(["2026-09-01"]);
    await expect(caller.darkDays.set({ dateKey: "2026-09-02", isDarkDay: true })).resolves.toEqual({ success: true });
    expect(mocks.setDarkDay).toHaveBeenCalledWith("2026-09-02", true);
  });

  it("authenticates operator with passcode 494 and rejects invalid passcodes", async () => {
    const dummyRes = { cookie: vi.fn(), clearCookie: vi.fn() };
    const ctx = {
      user: null,
      req: { protocol: "https", headers: {} },
      res: dummyRes,
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);

    // Invalid passcode should reject
    await expect(caller.auth.loginWithPasscode({ passcode: "123" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    // Correct passcode 494 succeeds and drops cookie
    const result = await caller.auth.loginWithPasscode({ passcode: "494" });
    expect(result.success).toBe(true);
    expect(result.user.role).toBe("admin");
    expect(dummyRes.cookie).toHaveBeenCalledOnce();
  });

  it("supports reading and writing siteContent notices", async () => {
    mocks.getSiteContent.mockResolvedValue("Welcome to SkyWorlds Operations");
    mocks.setSiteContent.mockResolvedValue(undefined);
    const userCtx = { user: { id: 1, openId: "operator-494", role: "admin" } } as TrpcContext;
    const anonCtx = { user: null } as TrpcContext;

    const publicCaller = appRouter.createCaller(anonCtx);
    const adminCaller = appRouter.createCaller(userCtx);

    await expect(publicCaller.siteContent.get({ key: "test_key" })).resolves.toEqual({
      value: "Welcome to SkyWorlds Operations",
    });

    await expect(adminCaller.siteContent.set({ key: "test_key", value: "Updated Notice" })).resolves.toEqual({
      success: true,
    });
    expect(mocks.setSiteContent).toHaveBeenCalledWith("test_key", "Updated Notice");

    // Anonymous cannot set siteContent
    await expect(publicCaller.siteContent.set({ key: "test_key", value: "Hacked" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
