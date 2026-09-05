import { describe, expect, it } from "vitest";
import { buildAnalysis } from "./downtimeAnalysis";
import type { DowntimeRecord } from "./downtimeProcessor";

function record(dateKey: string, rideCode: string, attraction: string, technicalMinutes: number, evacuationMinutes = 0): DowntimeRecord {
  return { sourceRow: 2, dateKey, dateLabel: dateKey, attraction, rideCode, department: "Technical", description: "Test event", technicalMinutes, operationsMinutes: 0, evacuationMinutes, evacuationStart: evacuationMinutes ? 600 : undefined, evacuationEnd: evacuationMinutes ? 600 + evacuationMinutes : undefined, downtimePercentage: technicalMinutes / 4.8, isClosed: false, isFireAlarm: false, isLateHandover: false, status: "matched", matchNote: "Matched" };
}

describe("downtime analysis aggregation", () => {
  it("calculates multi-date metrics and ride ranking for a selected ride combination", () => {
    const result = buildAnalysis([
      { reportDate: "2026-09-01", records: [record("2026-09-01", "VTM", "Epic Voyage to Moonhaven", 10, 3), record("2026-09-01", "EHF", "Epic Hummingbird Flyers", 20)] },
      { reportDate: "2026-09-02", records: [record("2026-09-02", "VTM", "Epic Voyage to Moonhaven", 30)] },
    ], ["VTM"]);

    expect(result).toMatchObject({ totalTechnicalMinutes: 40, totalEvents: 2, totalEvacuationMinutes: 3, totalEvacuationEvents: 1, selectedDayCount: 2, selectedRideCount: 1, affectedRideCount: 1, averageEventsPerDay: 1, averageIncidentMinutes: 20 });
    expect(result.averageDowntimePercentage).toBeCloseTo(4.166666, 5);
    expect(result.topRides).toEqual([expect.objectContaining({ rideCode: "VTM", minutes: 40, events: 2, availabilityPercentage: expect.closeTo(95.833333, 5) })]);
    expect(result.dailyTrend).toEqual(expect.arrayContaining([expect.objectContaining({ dateKey: "2026-09-01", minutes: 10 }), expect.objectContaining({ dateKey: "2026-09-02", minutes: 30 })]));
    expect(result.peakDay).toEqual({ dateKey: "2026-09-02", label: "2 Sept", minutes: 30 });
  });
});
