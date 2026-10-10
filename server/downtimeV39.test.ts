import { describe, expect, it } from "vitest";
import { buildAnalysis } from "./downtimeAnalysis";

describe("Version 1.39 Enhancements", () => {
  it("builds ride breakdowns inside dailyTrend sorted by downtime minutes", () => {
    const mockReports = [
      {
        reportDate: "2026-10-01",
        records: [
          {
            sourceRow: 1,
            rideCode: "RTR",
            attraction: "Rivet Town Roller",
            technicalStart: 600, // 10:00
            technicalEnd: 612,   // 10:12 (12 mins)
            technicalMinutes: 12,
            evacuationStart: undefined,
            evacuationEnd: undefined,
            evacuationMinutes: 0,
            description: "Car fault",
          },
          {
            sourceRow: 2,
            rideCode: "ACR",
            attraction: "Acorn Adventure",
            technicalStart: 700,
            technicalEnd: 730, // 30 mins
            technicalMinutes: 30,
            evacuationStart: undefined,
            evacuationEnd: undefined,
            evacuationMinutes: 0,
            description: "Restraint fault",
          },
          {
            sourceRow: 3,
            rideCode: "RTR",
            attraction: "Rivet Town Roller",
            technicalStart: 800,
            technicalEnd: 810, // 10 mins (total RTR: 22 mins)
            technicalMinutes: 10,
            evacuationStart: undefined,
            evacuationEnd: undefined,
            evacuationMinutes: 0,
            description: "Sensor fault",
          },
        ],
      },
    ];

    const result = buildAnalysis(mockReports as any, []);
    expect(result.dailyTrend.length).toBe(1);
    const day = result.dailyTrend[0];
    expect(day.rideBreakdown).toBeDefined();
    expect(day.rideBreakdown?.length).toBe(2);

    // Sorted ascending by minutes (shortest on top, longest on bottom for stacking)
    // RTR total: 22m, ACR total: 30m -> RTR (22m) first, ACR (30m) second
    expect(day.rideBreakdown![0].rideCode).toBe("RTR");
    expect(day.rideBreakdown![0].minutes).toBe(22);
    expect(day.rideBreakdown![0].events).toBe(2);

    expect(day.rideBreakdown![1].rideCode).toBe("ACR");
    expect(day.rideBreakdown![1].minutes).toBe(30);
    expect(day.rideBreakdown![1].events).toBe(1);
  });
});
