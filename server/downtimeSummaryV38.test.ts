import { describe, expect, it } from "vitest";
import { buildDowntimeSummaryDocx } from "./downtimeSummaryDocx";
import JSZip from "jszip";
import { appRouter } from "./routers";

describe("Version 38 enhancements", () => {
  it("includes line break after header on page 1 and before preventive action on page 2", async () => {
    const buffer = await buildDowntimeSummaryDocx({
      reportDate: "2026-09-21",
      amExecutive: "Firdaus, Adam",
      pmExecutive: "Yik Seng",
      entries: [
        {
          incidentKey: "v38-inc-1",
          zone: "Zone A",
          rideCode: "PTA",
          attraction: "Invasion of the Planet of the Apes",
          description: "Technical inspection on RV06",
          downtimeStart: "10:26",
          downtimeEnd: "10:49",
          durationMinutes: 23,
          shift: "AM",
          correctiveAction: "1. Verified\n2. Resolved",
          preventiveAction: "1. Weekly check",
          status: "Monitoring",
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    expect(docXml).toBeDefined();

    const pBreakIdx = docXml!.indexOf('w:type="page"');
    expect(pBreakIdx).toBeGreaterThan(0);

    const firstTableIdx = docXml!.indexOf("<w:tbl");
    const firstPIdx = docXml!.indexOf("<w:p");
    expect(firstPIdx).toBeLessThan(firstTableIdx);

    const afterBreak = docXml!.slice(pBreakIdx);
    const secondFirstP = afterBreak.indexOf("<w:p");
    const secondTableIdx = afterBreak.indexOf("<w:tbl");
    expect(secondFirstP).toBeLessThan(secondTableIdx);
  });

  it("exposes faultpedia tRPC router procedures", () => {
    expect(appRouter._def.procedures).toBeDefined();
    expect(appRouter._def.procedures["faultpedia.list"]).toBeDefined();
    expect(appRouter._def.procedures["faultpedia.create"]).toBeDefined();
    expect(appRouter._def.procedures["faultpedia.update"]).toBeDefined();
    expect(appRouter._def.procedures["faultpedia.delete"]).toBeDefined();
  });
});
