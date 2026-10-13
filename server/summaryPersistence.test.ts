import { describe, expect, it } from "vitest";
import { resolveSummarySourceReportId, shouldUsePersistedSummary } from "../client/src/lib/summaryPersistence";

describe("Downtime Summary persisted state priority", () => {
  it("uses database-backed entries instead of an older session-only draft", () => {
    expect(shouldUsePersistedSummary(6)).toBe(true);
    expect(shouldUsePersistedSummary(0)).toBe(false);
    expect(shouldUsePersistedSummary(undefined)).toBe(false);
  });

  it("keeps a completed daily summary exportable after a source-log row is replaced", () => {
    expect(resolveSummarySourceReportId(1620002, 1620001)).toBe(1620002);
    expect(resolveSummarySourceReportId(undefined, 1620001)).toBe(1620001);
    expect(resolveSummarySourceReportId(null, null)).toBeNull();
  });
});
