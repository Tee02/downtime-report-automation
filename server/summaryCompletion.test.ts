import { describe, expect, it } from "vitest";
import { getSummaryCompletion } from "../client/src/lib/summaryCompletion";

describe("Downtime Summary export readiness", () => {
  it("marks an incident ready only after all three required narratives are recorded", () => {
    expect(getSummaryCompletion({
      rootCause: "Verified damaged 24V fuse.",
      correctiveAction: "1. Replaced the damaged fuse.",
      preventiveAction: "1. Inspect the fuse holder weekly.",
    })).toMatchObject({
      isReady: true,
      label: "Ready to export",
      missing: [],
    });
  });

  it("names the exact missing narrative when only one field is incomplete", () => {
    expect(getSummaryCompletion({
      rootCause: "Verified damaged 24V fuse.",
      correctiveAction: "1. Replaced the damaged fuse.",
      preventiveAction: "   ",
    })).toMatchObject({
      isReady: false,
      label: "Needs preventive action",
      missing: ["Preventive action"],
    });
  });

  it("keeps incomplete incidents out of the ready export cohort", () => {
    const incidents = [
      { rootCause: "Cause", correctiveAction: "Correction", preventiveAction: "Prevention" },
      { rootCause: "Cause", correctiveAction: "", preventiveAction: "" },
    ];

    const ready = incidents.filter(entry => getSummaryCompletion(entry).isReady);
    expect(ready).toHaveLength(1);
  });
});
