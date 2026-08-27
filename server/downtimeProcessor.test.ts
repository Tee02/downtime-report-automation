import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { __testables, durationMinutes, formatTime, parseTimeToMinutes, processDowntimeWorkbooks, resolveRideCode } from "./downtimeProcessor";

describe("downtime transformation rules", () => {
  it("uses downtime start through ride readiness for technical minutes", () => {
    const start = parseTimeToMinutes("0.45416666666666666");
    const readiness = parseTimeToMinutes("0.46319444444444446");
    expect(formatTime(start)).toBe("10:54");
    expect(formatTime(readiness)).toBe("11:07");
    expect(durationMinutes(start, readiness)).toBe(13);
  });

  it("handles overnight timing defensively", () => {
    expect(durationMinutes(23 * 60 + 55, 5)).toBe(10);
    expect(parseTimeToMinutes("")).toBeUndefined();
  });

  it("maps source attractions to technical template ride codes", () => {
    expect(resolveRideCode("ESD : Global Defender")).toBe("ESD");
    expect(resolveRideCode("Terraform Tower Challenge")).toBe("TTC");
    expect(resolveRideCode("Invasion Of The Planet of the Apes")).toBe("PTA");
    expect(resolveRideCode("Unknown Demonstration Ride")).toBeUndefined();
  });

  it("retains a populated cell immediately after a blank template cell", () => {
    const rows = __testables.parseRows(
      '<worksheet><sheetData><row r="92"><c r="A92" s="245"/><c r="B92" s="114" t="s"><v>0</v></c><c r="C92" t="s"><v>1</v></c></row></sheetData></worksheet>',
      ["ESD", "A"]
    );
    expect(rows[0]?.cells.get("A")?.value).toBe("");
    expect(rows[0]?.cells.get("B")?.value).toBe("ESD");
    expect(rows[0]?.cells.get("C")?.value).toBe("A");
  });
});

describe("supplied workbook integration", () => {
  const operationsFixture = "/home/ubuntu/upload/26.08.2026Tech-SkyWorldsDowntimeLog.xlsx";
  const templateFixture = "/home/ubuntu/upload/WKtemplate.xlsx";
  const canRunFixture = existsSync(operationsFixture) && existsSync(templateFixture);

  it.skipIf(!canRunFixture)("preserves the fixed template while filtering AVL records, resetting inactive percentages, and applying the requested closure fill", async () => {
    const result = await processDowntimeWorkbooks(await readFile(operationsFixture), await readFile(templateFixture));

    expect(result.records).toHaveLength(14);
    expect(result.matchedCount).toBe(12);
    expect(result.unmatchedCount).toBe(0);
    expect(result.closedRideCount).toBe(2);
    expect(result.records.filter(record => !record.isClosed).every(record => record.department === "Technical")).toBe(true);
    expect(result.records.some(record => /AVL/i.test(record.description))).toBe(false);
    expect(result.totalTechnicalMinutes).toBe(229);
    expect(result.totalNetworkPercentage).toBeCloseTo((229 / 8640) * 100, 8);
    expect(result.outputBuffer.length).toBeGreaterThan(100_000);

    const output = await JSZip.loadAsync(result.outputBuffer);
    expect(Object.keys(output.files)).toContain("xl/worksheets/sheet1.xml");
    const xmlParser = new XMLParser({ ignoreAttributes: false });
    for (const path of Object.keys(output.files).filter(path => path.endsWith(".xml") || path.endsWith(".rels"))) {
      const file = output.file(path);
      if (!file) continue;
      const xml = await file.async("string");
      expect(() => xmlParser.parse(xml)).not.toThrow();
    }
    const timelineXml = await output.file("xl/worksheets/sheet1.xml")?.async("string");
    const stylesXml = await output.file("xl/styles.xml")?.async("string");
    expect(timelineXml).toContain('<c r="BH92" s="1997"');
    expect(timelineXml).toContain('<c r="BV92" s="1998"');
    expect(timelineXml).toContain('<c r="BB88" s="1969"');
    expect(timelineXml).toContain('<c r="F107" s="515"');
    const styles = xmlParser.parse(stylesXml ?? "") as any;
    const closedFillId = Number(styles.styleSheet?.cellXfs?.xf?.[515]?.["@_fillId"]);
    expect(styles.styleSheet?.fills?.fill?.[closedFillId]?.patternFill?.fgColor?.["@_rgb"]).toBe("FFF8CBAD");
    expect(timelineXml).toContain("<f>68/480</f>");
    expect(timelineXml).toContain("<f>SUM(D88:D108)/18</f>");
    expect(timelineXml).toMatch(/<c r="D4"(?: s="\d+")?><v>0<\/v><\/c>/);
    expect(timelineXml).toMatch(/<c r="E4"(?: s="\d+")?><v>0<\/v><\/c>/);
    expect(timelineXml).toMatch(/<c r="D103"(?: s="\d+")?><v>0<\/v><\/c>/);
    expect(timelineXml).toContain("Closed — Unplanned Closure Due To Technical Issue (Motor Issue)");
    expect(timelineXml).toContain('Technical Inspection On RV1 (Lap Bar Toggle Loose)');
  }, 30_000);
});
