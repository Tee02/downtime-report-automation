import { describe, expect, it } from "vitest";
import { buildAnalysis } from "./downtimeAnalysis";
import type { DowntimeRecord } from "./downtimeProcessor";

function record(dateKey: string, rideCode: string, attraction: string, technicalMinutes: number, evacuationMinutes = 0): DowntimeRecord {
  return {
    sourceRow: 2,
    dateKey,
    dateLabel: dateKey,
    attraction,
    rideCode,
    department: "Technical",
    description: "Lift 1 sensor trip",
    technicalStart: 600,
    technicalEnd: 600 + technicalMinutes,
    technicalMinutes,
    operationsMinutes: 0,
    evacuationMinutes,
    evacuationStart: evacuationMinutes ? 600 : undefined,
    evacuationEnd: evacuationMinutes ? 600 + evacuationMinutes : undefined,
    downtimePercentage: technicalMinutes / 4.8,
    isClosed: false,
    isFireAlarm: false,
    isLateHandover: false,
    status: "matched",
    matchNote: "Matched",
  };
}

describe("downtime analysis aggregation", () => {
  it("calculates multi-date metrics and ride ranking for a selected ride combination", () => {
    const result = buildAnalysis([
      {
        reportDate: "2026-09-01",
        records: [
          record("2026-09-01", "VTM", "Epic Voyage to Moonhaven", 10, 3),
          record("2026-09-01", "EHF", "Epic Hummingbird Flyers", 20),
        ],
        weatherText: "VTM - 11-3: Inclement Weather @1400H\n11-8: @1430H",
      },
      {
        reportDate: "2026-09-02",
        records: [record("2026-09-02", "VTM", "Epic Voyage to Moonhaven", 30)],
      },
    ], ["VTM"], ["2026-09-01"]);

    expect(result).toMatchObject({
      totalTechnicalMinutes: 40,
      totalEvents: 2,
      totalEvacuationMinutes: 3,
      totalEvacuationEvents: 1,
      selectedDayCount: 2,
      selectedRideCount: 1,
      affectedRideCount: 1,
      averageEventsPerDay: 1,
      averageIncidentMinutes: 20,
    });
    expect(result.averageDowntimePercentage).toBeCloseTo(4.166666, 5);
    expect(result.topRides).toEqual([
      expect.objectContaining({ rideCode: "VTM", minutes: 40, events: 2, availabilityPercentage: expect.closeTo(95.833333, 5) }),
    ]);
    expect(result.dailyTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({ dateKey: "2026-09-01", minutes: 10 }),
      expect.objectContaining({ dateKey: "2026-09-02", minutes: 30 }),
    ]));
    expect(result.peakDay).toMatchObject({ dateKey: "2026-09-02", label: "2 Sept", minutes: 30 });

    // Weekday pattern must have dates and be sorted starting with Monday
    expect(result.weekdayPattern[0]).toHaveProperty("dates");
    expect(Array.isArray(result.weekdayPattern[0].dates)).toBe(true);

    // Incident logs must contain technical, weather, and dark day records
    expect(result.incidentLogs.length).toBeGreaterThanOrEqual(3);
    const darkDayLog = result.incidentLogs.find(l => l.kind === "darkDay");
    expect(darkDayLog).toBeDefined();
    expect(darkDayLog?.dateKey).toBe("2026-09-01");

    const weatherLog = result.incidentLogs.find(l => l.kind === "weather");
    expect(weatherLog).toBeDefined();
    expect(weatherLog?.rideCode).toBe("VTM");

    const techLog = result.incidentLogs.find(l => l.kind === "technical" && l.rideCode === "VTM");
    expect(techLog).toBeDefined();
    expect(techLog?.timeRange).toBe("10:00-10:10");
    expect(techLog?.evacuationLabel).toBe("evac 3mins");
    expect(techLog?.evacuationRange).toBe("10:00-10:03");

    // EHF was not selected in ["VTM"], so its technical log should NOT appear
    const ehfLog = result.incidentLogs.find(l => l.kind === "technical" && l.rideCode === "EHF");
    expect(ehfLog).toBeUndefined();

    // Ride incident groups must group logs by ride and include dark days
    expect(result.rideIncidentGroups).toBeDefined();
    const vtmGroup = result.rideIncidentGroups.find(g => g.rideCode === "VTM");
    expect(vtmGroup).toBeDefined();
    expect(vtmGroup?.logs.some(l => l.kind === "darkDay")).toBe(true);
    expect(vtmGroup?.logs.some(l => l.kind === "technical")).toBe(true);
    expect(vtmGroup?.logs.some(l => l.kind === "weather")).toBe(true);
  });

  it("adds dark-day remarks only to ride groups that already have an incident", () => {
    const result = buildAnalysis([
      { reportDate: "2026-09-08", records: [record("2026-09-08", "VTM", "Epic Voyage to Moonhaven", 10)] },
    ], [], ["2026-09-08"]);

    const vtmGroup = result.rideIncidentGroups.find(group => group.rideCode === "VTM");
    expect(vtmGroup?.logs.map(log => log.kind)).toEqual(["darkDay", "technical"]);
    expect(result.rideIncidentGroups.find(group => group.rideCode === "BCT (EV)")).toBeUndefined();
  });

  it("includes verified Signal 29 fire alarms in ride incident logs while excluding them from downtime totals", () => {
    const fireAlarm = {
      ...record("2026-09-08", "VTM", "Epic Voyage to Moonhaven", 8),
      sourceRow: 3,
      description: "Fire alarm",
      isFireAlarm: true,
    };
    const result = buildAnalysis([
      { reportDate: "2026-09-08", records: [record("2026-09-08", "VTM", "Epic Voyage to Moonhaven", 10), fireAlarm] },
    ], [], []);

    expect(result).toMatchObject({ totalTechnicalMinutes: 10, totalEvents: 1, totalEvacuationMinutes: 0 });
    const alarm = result.incidentLogs.find(log => log.kind === "fireAlarm");
    expect(alarm).toMatchObject({ description: "Signal 29 (Fire Alarm Triggered)", timeRange: "10:00-10:08" });
    const vtmGroup = result.rideIncidentGroups.find(group => group.rideCode === "VTM");
    expect(vtmGroup?.logs.some(log => log.kind === "fireAlarm")).toBe(true);
  });
});
