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
    const expectedMappings = [
      ["ESD : Global Defender", "ESD"], ["Independence Day : Defiance", "IDD"], ["Blue Sky Carousel", "BSC"], ["Samba Gliders", "SAG"], ["Rio Carnaval Chaos", "RCC"],
      ["Epic Hummingbird Flyers", "EHF"], ["Epic Voyage to Moonhaven", "VTM"], ["Acorn Adventure", "ACR"], ["Expedition Thin Ice", "ETI"], ["Mammoth Fun Zone", "MFZ"],
      ["Sid's Rock 'N' Slide", "SRS"], ["Alpha Fighter Pilots", "AFP"], ["Terraform Tower Challenge", "TTC"], ["Boot Camp Training - Extreme Vert", "BCT (EV)"],
      ["Boot Camp Training - Ropes Course", "BCT (RC)"], ["Boot Camp Training - Unharnessed Zones", "BCT (UZ)"], ["Boot Camp Training - Zip Coaster", "BCT (ZC)"],
      ["Bigweld's Zeppelins", "BWZ"], ["Rivet Town Roller", "RTR"], ["Invasion Of The Planet of the Apes", "PTA"],
    ] as const;
    expectedMappings.forEach(([attraction, rideCode]) => expect(resolveRideCode(attraction)).toBe(rideCode));
    expect(resolveRideCode("BCT", "Zip Coaster restraint check")).toBe("BCT (ZC)");
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
  const templateFixture = "/home/ubuntu/upload/WK_template_v2.xlsx";
  const canRunFixture = existsSync(operationsFixture) && existsSync(templateFixture);

  it.skipIf(!canRunFixture)("adapts the cleared V2 template to the uploaded report date, weekly availability first day, and percentage alert rules", async () => {
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
    const timelineXml = await output.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const stylesXml = await output.file("xl/styles.xml")?.async("string");
    const workbookXml = await output.file("xl/workbook.xml")?.async("string") ?? "";
    const cell = (reference: string) => new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(timelineXml)?.[0] ?? "";
    const cellStyle = (reference: string) => Number(/\bs="(\d+)"/.exec(cell(reference))?.[1]);
    const styles = xmlParser.parse(stylesXml ?? "") as any;
    const xfs = styles.styleSheet?.cellXfs?.xf ?? [];
    const fills = styles.styleSheet?.fills?.fill ?? [];
    const fonts = styles.styleSheet?.fonts?.font ?? [];
    const closedFillId = Number(xfs[cellStyle("F23")]?.["@_fillId"]);
    expect(styles.styleSheet?.fills?.fill?.[closedFillId]?.patternFill?.fgColor?.["@_rgb"]).toBe("FFF8CBAD");
    expect(fills[closedFillId]?.patternFill?.fgColor?.["@_rgb"]).toBe("FFF8CBAD");
    const fontColor = (reference: string) => fonts[Number(xfs[cellStyle(reference)]?.["@_fontId"])]?.color?.["@_rgb"];
    const fillColor = (reference: string) => fills[Number(xfs[cellStyle(reference)]?.["@_fillId"])]?.patternFill?.fgColor?.["@_rgb"];
    expect(fontColor("D8")).toBe("FFFF0000");
    expect(fontColor("E4")).toBe("FFFF0000");
    expect(timelineXml).toContain("26 Aug\nWed");
    expect(workbookXml).toContain('name="26 Aug-1 Sep 2026"');
    expect(cell("D8")).toContain("<f>68/480</f>");
    expect(cell("E4")).toContain("<f>SUM(D4:D24)/18</f>");
    expect(cell("BZ48")).toContain("<v>26</v>");
    expect(cell("BZ50")).toContain(">Wed</t>");
    expect(cell("BZ58")).toContain("<f>D8</f>");
    expect(cell("BZ110")).toContain("<f>D6</f>");
    expect(cell("BZ82")).toContain("<v>0</v>");
    expect(fontColor("BZ58")).toBe("FFFF0000");
    expect(fillColor("BZ58")).toBe("FFFFF2CC");
    expect(cell("BZ61")).toContain("<f>D12</f>");
    expect(fontColor("BZ61")).not.toBe("FFFF0000");
    expect(fontColor("BZ82")).toBe("FF7030A0");
    expect(cell("CU48")).toMatch(/^<c r="CU48"(?: s="\d+")?\/>$/);
    expect(cell("CU50")).toMatch(/^<c r="CU50"(?: s="\d+")?\/>$/);
    expect(cell("CU58")).toMatch(/^<c r="CU58"(?: s="\d+")?\/>$/);
    expect(cell("HQ58")).toMatch(/^<c r="HQ58"(?: s="\d+")?\/>$/);
    expect(timelineXml).toContain("Closed — Unplanned Closure Due To Technical Issue (Motor Issue)");
    const evacuation = result.records.find(record => !record.isClosed && record.evacuationStart !== undefined && record.evacuationEnd !== undefined);
    expect(evacuation).toBeDefined();
    const timelineRows: Record<string, number> = { ACR: 4, EHF: 9, TTC: 24 };
    const toColumn = (number: number) => {
      let value = number;
      let column = "";
      while (value > 0) {
        column = String.fromCharCode(65 + ((value - 1) % 26)) + column;
        value = Math.floor((value - 1) / 26);
      }
      return column;
    };
    const evacuationRow = timelineRows[evacuation?.rideCode ?? ""];
    const evacuationCell = `${toColumn(6 + (evacuation?.evacuationStart ?? 600) - 600)}${evacuationRow}`;
    const resumedTechnicalCell = `${toColumn(6 + (evacuation?.evacuationEnd ?? 600) + 1 - 600)}${evacuationRow}`;
    expect(Number(xfs[cellStyle(evacuationCell)]?.["@_fillId"])).toBe(17);
    expect(Number(xfs[cellStyle(resumedTechnicalCell)]?.["@_fillId"])).toBe(3);
    expect(timelineXml).toContain('Technical Inspection On RV1 (Lap Bar Toggle Loose)');
  }, 30_000);
});
