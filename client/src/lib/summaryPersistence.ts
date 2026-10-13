export function shouldUsePersistedSummary(entryCount: number | null | undefined): boolean {
  return (entryCount ?? 0) > 0;
}

/**
 * A saved summary can outlive a replacement source-log row. Prefer the live
 * source report when available, but retain the stored summary reference so a
 * completed daily report remains viewable and exportable in every browser.
 */
export function resolveSummarySourceReportId(
  liveSourceReportId: number | null | undefined,
  persistedSourceReportId: number | null | undefined
): number | null {
  return liveSourceReportId ?? persistedSourceReportId ?? null;
}
