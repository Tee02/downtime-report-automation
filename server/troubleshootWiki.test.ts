import { describe, expect, it } from "vitest";
import { filterWikiFaults, INITIAL_TROUBLE_FAULTS, type TroubleFault, WIKI_RIDES, WIKI_CATEGORIES } from "../client/src/data/troubleshootWiki";

const operatorCards: TroubleFault[] = [
  {
    id: "operator-eti",
    dbId: 11,
    rideCode: "ETI",
    rideName: "Expedition Thin Ice",
    title: "24V fuse control voltage tripped",
    faultCode: "LB24V.Fuse.Trip",
    category: "Electrical",
    references: 2,
    symptom: "Restraint circuit is unavailable.",
    rootCause: "Fuse holder resistance.",
    correctiveActions: ["Inspect fuse holder", "Restore circuit safely"],
    preventiveAction: "Inspect at weekly PM.",
  },
  {
    id: "operator-ttc",
    dbId: 12,
    rideCode: "TTC",
    rideName: "Terraform Tower Challenge",
    title: "Platform sensor alignment",
    faultCode: "TTC.Sensor.Alignment",
    category: "Mechanical",
    references: 1,
    symptom: "Platform position does not confirm.",
    rootCause: "Sensor bracket shifted.",
    correctiveActions: ["Realign sensor"],
    preventiveAction: "Check bracket at monthly PM.",
  },
];

describe("Faultpedia filters and ride coverage", () => {
  it("includes all 21 attractions plus All rides in WIKI_RIDES", () => {
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

  it("keeps the starter library empty so only operator-entered cards are listed", () => {
    expect(INITIAL_TROUBLE_FAULTS).toEqual([]);
  });

  it("filters operator cards by selected ride, category, and keyword", () => {
    const results = filterWikiFaults(operatorCards, "ETI", "Electrical", "24V fuse", "referenced");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ rideCode: "ETI", category: "Electrical", faultCode: "LB24V.Fuse.Trip" });
  });

  it("sorts operator cards alphabetically or by references", () => {
    const alphabetical = filterWikiFaults(operatorCards, "ALL", "All faults", "", "alphabetical");
    expect(alphabetical[0].title <= alphabetical[1].title).toBe(true);

    const referenced = filterWikiFaults(operatorCards, "ALL", "All faults", "", "referenced");
    expect(referenced[0].references).toBeGreaterThanOrEqual(referenced[1].references);
  });
});
