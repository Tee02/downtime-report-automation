import { describe, expect, it } from "vitest";
import { filterWikiFaults, INITIAL_TROUBLE_FAULTS, WIKI_RIDES, WIKI_CATEGORIES } from "../client/src/data/troubleshootWiki";

describe("Faultpedia filters and ride coverage", () => {
  it("includes all 21 attractions plus All rides in WIKI_RIDES", () => {
    // 1 ("ALL") + 21 rides = 22 entries
    expect(WIKI_RIDES.length).toBe(22);
    expect(WIKI_RIDES[0].code).toBe("ALL");
    const codes = WIKI_RIDES.map((r) => r.code);
    expect(codes).toContain("ACR");
    expect(codes).toContain("BWZ");
    expect(codes).toContain("ETI");
    expect(codes).toContain("TTC");
    expect(codes).toContain("BCT (EV)");
    expect(codes).toContain("PTA");
  });

  it("restricts categories to Electrical, Mechanical, Other", () => {
    expect(WIKI_CATEGORIES).toEqual(["Electrical", "Mechanical", "Other"]);
  });

  it("filters common faults by selected ride, category, and keyword", () => {
    const results = filterWikiFaults(INITIAL_TROUBLE_FAULTS, "ETI", "Electrical", "24V fuse", "referenced");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      rideCode: "ETI",
      category: "Electrical",
      faultCode: "LB24V.Fuse.Trip",
    });
  });

  it("sorts alphabetical or most referenced properly", () => {
    const alphabetical = filterWikiFaults(INITIAL_TROUBLE_FAULTS, "ALL", "All faults", "", "alphabetical");
    expect(alphabetical[0].title <= alphabetical[1].title).toBe(true);

    const referenced = filterWikiFaults(INITIAL_TROUBLE_FAULTS, "ALL", "All faults", "", "referenced");
    expect(referenced[0].references).toBeGreaterThanOrEqual(referenced[1].references);
  });
});
