import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { __testables, compileDowntimeLogExport, durationMinutes, formatTime, parseTimeToMinutes, parseWeatherIntervals, processDowntimeWorkbooks, resolveRideCode } from "./downtimeProcessor";

async function buildMinimalOperationsWorkbook() {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<workbook><sheets><sheet name="Operations" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="2"><c r="A2" t="inlineStr"><is><t>03/09/2026</t></is></c><c r="B2" t="inlineStr"><is><t>Epic Voyage to Moonhaven</t></is></c><c r="C2" t="inlineStr"><is><t>Technical</t></is></c><c r="D2" t="inlineStr"><is><t>11-1</t></is></c><c r="F2" t="inlineStr"><is><t>Brake check</t></is></c><c r="G2" t="inlineStr"><is><t>10:00</t></is></c><c r="H2" t="inlineStr"><is><t>10:10</t></is></c></row></sheetData></worksheet>');
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalTemplateWorkbook() {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<workbook><sheets><sheet name="R&A Tech Downtime" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  const reportRows = Array.from({ length: 21 }, (_, index) => {
    const row = index + 4;
    if (row === 4) return '<row r="4"><c r="A4" t="inlineStr"><is><t>03 Sep</t></is></c></row>';
    if (row === 10) return '<row r="10"><c r="B10" t="inlineStr"><is><t>VTM</t></is></c></row>';
    return `<row r="${row}"></row>`;
  }).join("");
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="3"><c r="F3"><v>0.4166667</v></c><c r="G3"><v>0.4173611</v></c></row>${reportRows}<row r="107"></row></sheetData></worksheet>`);
  zip.file("xl/styles.xml", '<styleSheet><fonts count="1"><font><sz val="11"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB9DFF0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7C9DF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF146C94"/></patternFill></fill></fills><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  return zip.generateAsync({ type: "nodebuffer" });
}

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
      ["Epic Hummingbird Flyers", "EHF"], ["Epic Voyage to Moonhaven", "VTM"], ["Acorn Adventure", "ACR"], ["Expedition Thin Ice", "ETI"], ["Ice Age: Expedition Thin Ice", "ETI"], ["Mammoth Fun Zone", "MFZ"],
      ["Sid's Rock 'N' Slide", "SRS"], ["Alpha Fighter Pilots", "AFP"], ["Terraform Tower Challenge", "TTC"], ["Boot Camp Training - Extreme Vert", "BCT (EV)"],
      ["Boot Camp Training - Ropes Course", "BCT (RC)"], ["Boot Camp Training - Unharnessed Zones", "BCT (UZ)"], ["Boot Camp Training - Zip Coaster", "BCT (ZC)"],
      ["Bigweld's Zeppelins", "BWZ"], ["Big Weld's Zeppelin", "BWZ"], ["Rivet Town Roller", "RTR"], ["Invasion Of The Planet of the Apes", "PTA"],
    ] as const;
    expectedMappings.forEach(([attraction, rideCode]) => expect(resolveRideCode(attraction)).toBe(rideCode));
    expect(resolveRideCode("Night At The Museum")).toBe("NTM");
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

  it("pairs a single-ride weather start with an unlabelled resume and ignores operator initials", () => {
    const intervals = parseWeatherIntervals("VTM - 11-3: Inclement Weather (10-13 Purple); No Guest Onboard @1515H\n11-8: @1626H\nFS", "2026-09-03");
    expect(intervals).toEqual([expect.objectContaining({ rideCode: "VTM", startedAt: 915, resumedAt: 986, minutes: 71, condition: "10-13 Purple — Fog" })]);
  });

  it("pairs grouped weather messages ride by ride and leaves unmatched starts out of the export", () => {
    const intervals = parseWeatherIntervals("11-3: Inclement Weather (10-13 Orange)\n\nBCT (EV): @1414H\nEHF: @1412H\nSAG@:1414H\nAH\n\n11-8: Inclement Weather (10-13 Orange)\n\nBCT (EV): @1501H\nEHF: @1500H\nSAG@:1500H\nMD", "2026-09-03");
    expect(intervals).toHaveLength(3);
    expect(intervals).toEqual(expect.arrayContaining([
      expect.objectContaining({ rideCode: "BCT (EV)", minutes: 47, condition: "10-13 Orange — Moderate to heavy rain" }),
      expect.objectContaining({ rideCode: "EHF", minutes: 48 }),
      expect.objectContaining({ rideCode: "SAG", minutes: 46 }),
    ]));
  });

  it("maps complete weather intervals in orange without changing technical metrics", async () => {
    const [operations, template] = await Promise.all([buildMinimalOperationsWorkbook(), buildMinimalTemplateWorkbook()]);
    const baseline = await processDowntimeWorkbooks(operations, template);
    const result = await processDowntimeWorkbooks(operations, template, { weatherText: "VTM - 11-3: Inclement Weather (10-13 Green) @1015H\n11-8: @1030H" });
    expect(result.weatherIntervalCount).toBe(1);
    expect(result.totalTechnicalMinutes).toBe(baseline.totalTechnicalMinutes);
    expect(result.totalNetworkPercentage).toBe(baseline.totalNetworkPercentage);

    const output = await JSZip.loadAsync(result.outputBuffer);
    const timelineXml = await output.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const baselineOutput = await JSZip.loadAsync(baseline.outputBuffer);
    const baselineTimelineXml = await baselineOutput.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const stylesXml = await output.file("xl/styles.xml")?.async("string") ?? "";
    const cell = (reference: string) => new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(timelineXml)?.[0] ?? "";
    const styleId = Number(/\bs="(\d+)"/.exec(cell("U10"))?.[1]);
    const parsedStyles = new XMLParser({ ignoreAttributes: false }).parse(stylesXml) as any;
    const xfs = parsedStyles.styleSheet?.cellXfs?.xf ?? [];
    const fills = parsedStyles.styleSheet?.fills?.fill ?? [];
    const weatherFillId = Number(xfs[styleId]?.["@_fillId"]);
    expect(fills[weatherFillId]?.patternFill?.fgColor?.["@_rgb"]).toBe("FFFFC000");
    expect(timelineXml).toContain("Weather — 10-13 Green — Light rain (10:15-10:30)");
    ["D10", "E4", "BZ107"].forEach(reference => {
      const baselineCell = new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(baselineTimelineXml)?.[0] ?? "";
      expect(cell(reference)).toBe(baselineCell);
    });
  });

  it("compiles selected source-log rides into a valid XLSX using the uploaded-log worksheet structure", async () => {
    const source = await buildMinimalOperationsWorkbook();
    const output = await compileDowntimeLogExport([{ reportDate: "2026-09-03", buffer: source }], ["VTM"]);
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    expect(xml).toContain("Epic Voyage to Moonhaven");
    expect(xml).toContain("03/09/2026");
    expect(xml).toContain('<row r="1">');
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
    expect(result.totalNetworkPercentage).toBeCloseTo((229 / 9120) * 100, 8);
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
    expect(cell("E4")).toContain("<f>SUM(D4:D24)/19</f>");
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
    expect(Number(xfs[cellStyle(evacuationCell)]?.["@_fillId"])).toBe(7);
    expect(Number(xfs[cellStyle(resumedTechnicalCell)]?.["@_fillId"])).toBe(3);
    expect(timelineXml).toContain('Technical Inspection On RV1 (Lap Bar Toggle Loose)');
  }, 30_000);

  it.skipIf(!canRunFixture)("clears the planned-closure AFP row only when AFP is neither in the log nor selected during handover", async () => {
    const operationsZip = await JSZip.loadAsync(await readFile(operationsFixture));
    const sharedStringsPath = "xl/sharedStrings.xml";
    const sharedStrings = await operationsZip.file(sharedStringsPath)?.async("string") ?? "";
    operationsZip.file(sharedStringsPath, sharedStrings.replace(/Alpha Fighter Pilots/g, "Planned AFP placeholder"));
    const withoutAfpLog = await operationsZip.generateAsync({ type: "nodebuffer" });
    const result = await processDowntimeWorkbooks(withoutAfpLog, await readFile(templateFixture));
    expect(result.records.some(record => record.rideCode === "AFP")).toBe(false);
    const output = await JSZip.loadAsync(result.outputBuffer);
    const timelineXml = await output.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const styles = new XMLParser({ ignoreAttributes: false }).parse(await output.file("xl/styles.xml")?.async("string") ?? "") as any;
    const xfs = styles.styleSheet?.cellXfs?.xf ?? [];
    const fills = styles.styleSheet?.fills?.fill ?? [];
    const cell = (reference: string) => new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(timelineXml)?.[0] ?? "";
    const fillId = (reference: string) => Number(xfs[Number(/\bs="(\d+)"/.exec(cell(reference))?.[1])]?.["@_fillId"]);
    expect(cell("D7")).toMatch(/^<c r="D7"(?: s="\d+")?\/>$/);
    expect(cell("F7")).toMatch(/^<c r="F7"(?: s="\d+")?\/>$/);
    expect(fillId("F7")).toBe(0);
    expect(cell("BZ82")).toMatch(/^<c r="BZ82"(?: s="\d+")?\/>$/);

    const handoverResult = await processDowntimeWorkbooks(withoutAfpLog, await readFile(templateFixture), { manualClosedRideCodes: ["AFP"] });
    const handoverOutput = await JSZip.loadAsync(handoverResult.outputBuffer);
    const handoverTimeline = await handoverOutput.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const handoverStyles = new XMLParser({ ignoreAttributes: false }).parse(await handoverOutput.file("xl/styles.xml")?.async("string") ?? "") as any;
    const handoverCell = (reference: string) => new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(handoverTimeline)?.[0] ?? "";
    const handoverXfs = handoverStyles.styleSheet?.cellXfs?.xf ?? [];
    const handoverFills = handoverStyles.styleSheet?.fills?.fill ?? [];
    const handoverFillId = Number(handoverXfs[Number(/\bs="(\d+)"/.exec(handoverCell("F7"))?.[1])]?.["@_fillId"]);
    expect(handoverFills[handoverFillId]?.patternFill?.fgColor?.["@_rgb"]).toBe("FFF8CBAD");
  }, 30_000);

  const may29Fixture = "/home/ubuntu/upload/29.05.2026Tech-SkyWorldsDowntimeLog.xlsx";

  it.skipIf(!existsSync(may29Fixture) || !existsSync(templateFixture))("maps the 29 May Ice Age: Expedition Thin Ice record into ETI while retaining AFP when the source log includes it", async () => {
    const result = await processDowntimeWorkbooks(await readFile(may29Fixture), await readFile(templateFixture));
    const eti = result.records.find(record => record.attraction === "Ice Age: Expedition Thin Ice");
    const afp = result.records.find(record => record.rideCode === "AFP");
    expect(eti).toMatchObject({ rideCode: "ETI", status: "matched", technicalMinutes: 4, operationsMinutes: 1 });
    expect(result.unmatchedCount).toBe(0);
    expect(afp).toMatchObject({ status: "matched", isClosed: false });
  }, 30_000);

  const aug03Fixture = "/home/ubuntu/upload/03.08.2026Tech-SkyWorldsDowntimeLog.xlsx";

  it.skipIf(!existsSync(aug03Fixture) || !existsSync(templateFixture))("keeps 3 August intervals bounded, maps Big Weld's Zeppelin, and applies manual handover closures without changing summary-row fills", async () => {
    const result = await processDowntimeWorkbooks(await readFile(aug03Fixture), await readFile(templateFixture), { manualClosedRideCodes: ["NATM"] });
    expect(result.unmatchedCount).toBe(0);
    expect(result.records.find(record => record.attraction === "Big Weld's Zeppelin")?.rideCode).toBe("BWZ");
    expect(result.records.find(record => record.attraction === "Big Weld's Zeppelin")?.status).toBe("matched");
    expect(result.records.some(record => record.sourceRow === 0 && record.rideCode === "NTM" && record.isClosed)).toBe(true);
    expect(result.records.filter(record => ["ACR", "ESD", "AFP"].includes(record.rideCode ?? "")).every(record => record.evacuationStart === undefined)).toBe(true);

    const output = await JSZip.loadAsync(result.outputBuffer);
    const timelineXml = await output.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";
    const xmlParser = new XMLParser({ ignoreAttributes: false });
    const styles = xmlParser.parse(await output.file("xl/styles.xml")?.async("string") ?? "") as any;
    const xfs = styles.styleSheet?.cellXfs?.xf ?? [];
    const fills = styles.styleSheet?.fills?.fill ?? [];
    const fonts = styles.styleSheet?.fonts?.font ?? [];
    const cell = (reference: string) => new RegExp(`<c\\b(?=[^>]*\\br="${reference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(timelineXml)?.[0] ?? "";
    const cellStyle = (reference: string) => Number(/\bs="(\d+)"/.exec(cell(reference))?.[1]);
    const fillId = (reference: string) => Number(xfs[cellStyle(reference)]?.["@_fillId"]);
    const fillColor = (reference: string) => fills[fillId(reference)]?.patternFill?.fgColor?.["@_rgb"];
    const fontColor = (reference: string) => fonts[Number(xfs[cellStyle(reference)]?.["@_fontId"])]?.color?.["@_rgb"];

    expect(fillId("CT4")).toBe(3);
    expect(fillId("DA4")).toBe(3);
    expect(fillId("DE4")).toBe(4);
    expect(fillId("BV8")).toBe(3);
    expect(fillId("CF8")).toBe(4);
    expect(fillId("FV7")).toBe(3);
    expect(fillId("GC7")).toBe(4);
    expect(fillId("F20")).toBe(0);
    expect(fillId("EZ20")).toBe(3);
    expect(fillId("GX20")).toBe(4);
    expect(fillColor("F18")).toBe("FFF8CBAD");
    expect(cell("BZ113")).toContain("<f>D20</f>");
    expect(fontColor("BZ113")).toBe("FFFF0000");
    expect(fillColor("BZ113")).toBe("FFFFF2CC");
    expect(cell("BZ116")).toContain("<f>D22</f>");
    expect(fillId("BZ116")).toBe(0);
    expect(fillColor("BZ88")).not.toBe("FFFFF2CC");
    expect(fillColor("BZ119")).not.toBe("FFFFF2CC");
    expect(fillColor("BZ123")).not.toBe("FFFFF2CC");
  }, 30_000);
});
