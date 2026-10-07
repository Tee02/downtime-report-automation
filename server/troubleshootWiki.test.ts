import { describe, expect, it } from "vitest";
import { filterWikiFaults, INITIAL_TROUBLE_FAULTS } from "../client/src/data/troubleshootWiki";

describe("Troubleshoot Wiki filters", () => {
  it("filters common faults by selected ride, category, and keyword", () => {
    const results = filterWikiFaults(INITIAL_TROUBLE_FAULTS, "ETI", "Electrical", "24V fuse", "referenced");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      rideCode: "ETI",
      category: "Electrical",
      faultCode: "LB24V.Fuse.Trip",
    });
  });

  it("sorts critical faults before high and watch faults", () => {
    const results = filterWikiFaults(INITIAL_TROUBLE_FAULTS, "ALL", "All faults", "", "severity");

    expect(results.map((fault) => fault.severity)).toEqual(["Critical", "High", "High", "Watch", "Watch"]);
  });
});
