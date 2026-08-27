import JSZip from "jszip";

type XmlCell = { reference: string; column: string; value: string; style?: string };
type XmlRow = { number: number; cells: Map<string, XmlCell> };
type SheetInfo = { name: string; path: string; xml: string };

export type DowntimeRecord = {
  sourceRow: number;
  dateKey: string;
  dateLabel: string;
  attraction: string;
  rideCode?: string;
  department: string;
  description: string;
  technicalStart?: number;
  technicalEnd?: number;
  operationsEnd?: number;
  evacuationStart?: number;
  evacuationEnd?: number;
  technicalMinutes: number;
  operationsMinutes: number;
  evacuationMinutes: number;
  status: "matched" | "unmatched";
  matchNote: string;
};

export type ProcessingResult = {
  records: DowntimeRecord[];
  matchedCount: number;
  unmatchedCount: number;
  totalTechnicalMinutes: number;
  totalOperationsMinutes: number;
  totalEvacuationMinutes: number;
  summaryByRide: Array<{
    rideCode: string;
    attraction: string;
    minutes: number;
    events: number;
    evacuationMinutes: number;
  }>;
  outputBuffer: Buffer;
  outputFileName: string;
};

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const TECHNICAL_FILL_STYLE = "183";
const OPERATIONS_FILL_STYLE = "184";
const EVACUATION_FILL_STYLE = "181";
const DAILY_OPERATING_MINUTES = 480;

const ATTRACTION_CODES: Record<string, string> = {
  ACR: "ACR",
  ACORNADVENTURE: "ACR",
  AFP: "AFP",
  ALPHAFIGHTERPILOTS: "AFP",
  BSC: "BSC",
  BLUESKYCAROUSEL: "BSC",
  EHF: "EHF",
  EPICHUMMINGBIRDFLYERS: "EHF",
  ESD: "ESD",
  ESDGLOBALDEFENDER: "ESD",
  EPICVOYAGETOMOONHAVEN: "VTM",
  VTM: "VTM",
  PTA: "PTA",
  INVASIONOFTHEPLANETOFTHEAPES: "PTA",
  RCC: "RCC",
  RTR: "RTR",
  RIVETTOWNROLLER: "RTR",
  SAG: "SAG",
  SIDESHOWGAMES: "SAG",
  SRS: "SRS",
  SIDSROCKNSLIDE: "SRS",
  TTC: "TTC",
  TERRAFORMTOWERCHALLENGE: "TTC",
};

function attribute(xml: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(xml)?.[1];
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeText(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function columnFromReference(reference: string): string {
  return /^([A-Z]+)/.exec(reference)?.[1] ?? "";
}

function columnToNumber(column: string): number {
  return column.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function numberToColumn(value: number): string {
  let remainder = value;
  let column = "";
  while (remainder > 0) {
    const index = (remainder - 1) % 26;
    column = String.fromCharCode(65 + index) + column;
    remainder = Math.floor((remainder - 1) / 26);
  }
  return column;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const match of Array.from(xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))) {
    strings.push(
      Array.from(match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
        .map(part => decodeXml(part[1]))
        .join("")
    );
  }
  return strings;
}

function parseRows(xml: string, sharedStrings: string[]): XmlRow[] {
  const rows: XmlRow[] = [];
  for (const rowMatch of Array.from(xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g))) {
    const rowNumber = Number(attribute(rowMatch[1], "r") ?? "0");
    if (!rowNumber) continue;
    const cells = new Map<string, XmlCell>();
    for (const cellMatch of Array.from(rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
      const attrs = cellMatch[1];
      const reference = attribute(attrs, "r");
      if (!reference) continue;
      const type = attribute(attrs, "t");
      const style = attribute(attrs, "s");
      const body = cellMatch[2] ?? "";
      const inlineText = Array.from(body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
        .map(part => decodeXml(part[1]))
        .join("");
      const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      const value = type === "s" ? sharedStrings[Number(rawValue)] ?? "" : type === "inlineStr" ? inlineText : decodeXml(rawValue);
      const column = columnFromReference(reference);
      cells.set(column, { reference, column, value, style });
    }
    rows.push({ number: rowNumber, cells });
  }
  return rows;
}

async function textFromZip(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`The workbook is missing ${path}.`);
  return entry.async("string");
}

async function getSheets(zip: JSZip): Promise<{ sharedStrings: string[]; sheets: SheetInfo[] }> {
  const [workbookXml, relationshipsXml, sharedStringXml] = await Promise.all([
    textFromZip(zip, "xl/workbook.xml"),
    textFromZip(zip, "xl/_rels/workbook.xml.rels"),
    zip.file("xl/sharedStrings.xml")?.async("string") ?? Promise.resolve(""),
  ]);
  const relationships = new Map<string, string>();
  for (const relationship of Array.from(relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?/g))) {
    const id = attribute(relationship[1], "Id");
    const target = attribute(relationship[1], "Target");
    if (id && target) relationships.set(id, target.startsWith("xl/") ? target : `xl/${target}`);
  }
  const sheets: SheetInfo[] = [];
  for (const sheetMatch of Array.from(workbookXml.matchAll(/<sheet\b([^>]*)\/?/g))) {
    const name = attribute(sheetMatch[1], "name");
    const relationId = /r:id="([^"]*)"/.exec(sheetMatch[1])?.[1];
    const path = relationId ? relationships.get(relationId) : undefined;
    if (name && path) sheets.push({ name, path, xml: await textFromZip(zip, path) });
  }
  return { sharedStrings: parseSharedStrings(sharedStringXml), sheets };
}

function excelDateToKey(value: string): string | undefined {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 30000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(numberValue) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const numeric = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function timelineDateKey(value: string): string | undefined {
  const numeric = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (numeric) return `${numeric[2]}-${numeric[3]}`;
  const dotted = /(\d{1,2})[./-](\d{1,2})(?:[./-]\d{4})?/.exec(value);
  if (dotted) return `${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  const named = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.exec(value);
  if (!named) return undefined;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(named[2].toLowerCase()) + 1;
  return `${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

function dateLabel(dateKey: string): string {
  const [, , month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey) ?? [];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return month && day ? `${Number(day)} ${months[Number(month) - 1]}` : dateKey;
}

export function parseTimeToMinutes(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1) return Math.round(numeric * 1440);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d{3,4}$/.test(normalized)) {
    const hours = Number(normalized.slice(0, -2));
    const minutes = Number(normalized.slice(-2));
    if (hours < 24 && minutes < 60) return hours * 60 + minutes;
  }
  return undefined;
}

export function durationMinutes(start?: number, end?: number): number {
  if (start === undefined || end === undefined) return 0;
  return end >= start ? end - start : end + 1440 - start;
}

export function formatTime(minutes?: number): string {
  if (minutes === undefined) return "—";
  const normalised = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(normalised % 60).padStart(2, "0")}`;
}

export function resolveRideCode(attraction: string): string | undefined {
  return ATTRACTION_CODES[normalizeText(attraction)];
}

function parseOperations(recordsSheet: SheetInfo, sharedStrings: string[]): DowntimeRecord[] {
  const rows = parseRows(recordsSheet.xml, sharedStrings);
  const results: DowntimeRecord[] = [];
  for (const row of rows) {
    const code = row.cells.get("D")?.value.trim();
    if (code !== "11-1") continue;
    const rawDate = row.cells.get("A")?.value ?? "";
    const recordDateKey = excelDateToKey(rawDate);
    const attraction = row.cells.get("B")?.value.trim() ?? "";
    const description = row.cells.get("F")?.value.trim() ?? "";
    const technicalStart = parseTimeToMinutes(row.cells.get("G")?.value ?? "");
    const technicalEnd = parseTimeToMinutes(row.cells.get("H")?.value ?? "");
    const operationsEnd = parseTimeToMinutes(row.cells.get("J")?.value ?? "");
    const providedEvacuationStart = parseTimeToMinutes(row.cells.get("M")?.value ?? "");
    const evacuationEnd = parseTimeToMinutes(row.cells.get("N")?.value ?? "");
    const evacuationStart = evacuationEnd === undefined ? undefined : providedEvacuationStart ?? technicalStart;
    const record: DowntimeRecord = {
      sourceRow: row.number,
      dateKey: recordDateKey ?? "",
      dateLabel: recordDateKey ? dateLabel(recordDateKey) : "Unknown date",
      attraction,
      rideCode: resolveRideCode(attraction),
      department: row.cells.get("C")?.value.trim() ?? "",
      description,
      technicalStart,
      technicalEnd,
      operationsEnd,
      evacuationStart,
      evacuationEnd,
      technicalMinutes: durationMinutes(technicalStart, technicalEnd),
      operationsMinutes: durationMinutes(technicalEnd, operationsEnd),
      evacuationMinutes: durationMinutes(evacuationStart, evacuationEnd),
      status: "unmatched",
      matchNote: "Awaiting template match",
    };
    results.push(record);
  }
  return results;
}

type TemplateMaps = {
  timelineSheet: SheetInfo;
  summarySheet?: SheetInfo;
  timeStartColumn: number;
  timelineRows: Map<string, number>;
  summaryRows: Map<string, number>;
  summaryDateColumns: Map<string, number>;
};

function buildTemplateMaps(sheets: SheetInfo[], sharedStrings: string[]): TemplateMaps {
  const timelineSheet = sheets.find(sheet => /R&A Tech[\s\S]{0,100}Downtime/i.test(sheet.xml)) ?? sheets.at(-1);
  if (!timelineSheet) throw new Error("The technical template does not contain a worksheet.");
  const summarySheet = sheets.find(sheet => /Weekly Average Downtime/i.test(sheet.xml));
  const timelineRows = parseRows(timelineSheet.xml, sharedStrings);
  const rowThree = timelineRows.find(row => row.number === 3);
  const timeStartColumn = Math.min(
    ...Array.from(rowThree?.cells.values() ?? [])
      .filter(cell => {
        const value = Number(cell.value);
        return Number.isFinite(value) && value > 0.2 && value < 0.99;
      })
      .map(cell => columnToNumber(cell.column))
  );
  if (!Number.isFinite(timeStartColumn)) throw new Error("The technical template does not expose a minute-by-minute timeline in row 3.");
  const timelineMap = new Map<string, number>();
  let activeDate: string | undefined;
  for (const row of timelineRows) {
    const candidateDate = timelineDateKey(row.cells.get("A")?.value ?? "");
    if (candidateDate) activeDate = candidateDate;
    const code = row.cells.get("B")?.value.trim();
    if (activeDate && code) timelineMap.set(`${activeDate}|${code}`, row.number);
  }
  const summaryRows = new Map<string, number>();
  const summaryDateColumns = new Map<string, number>();
  if (summarySheet) {
    for (const row of parseRows(summarySheet.xml, sharedStrings)) {
      if (row.number === 4) {
        for (const cell of Array.from(row.cells.values())) {
          const key = excelDateToKey(cell.value);
          if (key) summaryDateColumns.set(key, columnToNumber(cell.column));
        }
      }
      const code = row.cells.get("B")?.value.trim();
      if (code) summaryRows.set(code, row.number);
    }
  }
  return { timelineSheet, summarySheet, timeStartColumn, timelineRows: timelineMap, summaryRows, summaryDateColumns };
}

function styleFromCell(cell: string): string | undefined {
  return attribute(cell, "s");
}

function findCell(rowXml: string, reference: string): string | undefined {
  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<c\\b(?=[^>]*\\br="${escapedReference}"[^>]*)(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`).exec(rowXml)?.[0];
}

function replaceCell(rowXml: string, reference: string, payload: string, requestedStyle?: string): string {
  const existing = findCell(rowXml, reference);
  const style = requestedStyle ?? (existing ? styleFromCell(existing) : undefined);
  const replacement = `<c r="${reference}"${style ? ` s="${style}"` : ""}${payload}</c>`;
  if (!existing) return rowXml.replace("</row>", `${replacement}</row>`);
  return rowXml.replace(existing, replacement);
}

function setNumber(rowXml: string, reference: string, value: number): string {
  return replaceCell(rowXml, reference, `><v>${Number.isFinite(value) ? value : 0}</v>`);
}

function setText(rowXml: string, reference: string, value: string): string {
  return replaceCell(rowXml, reference, ` t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is>`);
}

function setStyle(rowXml: string, reference: string, style: string): string {
  const existing = findCell(rowXml, reference);
  if (!existing) return replaceCell(rowXml, reference, `><v></v>`, style);
  const body = /<c\b[^>]*>([\s\S]*?)<\/c>/.exec(existing)?.[1] ?? "";
  return replaceCell(rowXml, reference, `>${body}`, style);
}

function changeRows(xml: string, updates: Map<number, (rowXml: string) => string>): string {
  return xml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (complete, attrs) => {
    const rowNumber = Number(attribute(attrs, "r") ?? "0");
    return updates.get(rowNumber)?.(complete) ?? complete;
  });
}

function prepareTimelineUpdates(records: DowntimeRecord[], maps: TemplateMaps): Map<number, (rowXml: string) => string> {
  const byRow = new Map<number, DowntimeRecord[]>();
  for (const record of records.filter(item => item.status === "matched" && item.rideCode && item.technicalStart !== undefined && item.technicalEnd !== undefined)) {
    const key = `${timelineDateKey(record.dateKey)}|${record.rideCode}`;
    const row = maps.timelineRows.get(key);
    if (!row) continue;
    byRow.set(row, [...(byRow.get(row) ?? []), record]);
  }
  const updates = new Map<number, (rowXml: string) => string>();
  for (const [rowNumber, rowRecords] of Array.from(byRow.entries())) {
    updates.set(rowNumber, rowXml => {
      const cellStyles = new Map<string, { style: string; priority: number }>();
      const descriptions: Array<{ reference: string; value: string }> = [];
      const setRange = (start: number | undefined, end: number | undefined, style: string, priority: number) => {
        if (start === undefined || end === undefined) return;
        const finalEnd = end >= start ? end : end + 1440;
        for (let minute = start; minute <= finalEnd; minute++) {
          const column = maps.timeStartColumn + (minute % 1440) - 600;
          if (column < maps.timeStartColumn) continue;
          const reference = `${numberToColumn(column)}${rowNumber}`;
          const previous = cellStyles.get(reference);
          if (!previous || priority >= previous.priority) cellStyles.set(reference, { style, priority });
        }
      };
      for (const record of rowRecords) {
        setRange(record.technicalStart, record.technicalEnd, TECHNICAL_FILL_STYLE, 1);
        if (record.operationsEnd !== undefined && record.technicalEnd !== undefined) {
          setRange(record.technicalEnd + 1, record.operationsEnd, OPERATIONS_FILL_STYLE, 2);
        }
        setRange(record.evacuationStart, record.evacuationEnd, EVACUATION_FILL_STYLE, 3);
        const labelColumn = Math.max(maps.timeStartColumn, maps.timeStartColumn + (record.technicalStart! % 1440) - 605);
        descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: record.description });
      }
      let revised = rowXml;
      for (const description of descriptions) revised = setText(revised, description.reference, description.value);
      for (const [reference, detail] of Array.from(cellStyles.entries())) revised = setStyle(revised, reference, detail.style);
      return revised;
    });
  }
  return updates;
}

type DailyAggregate = {
  dateKey: string;
  rideCode: string;
  attraction: string;
  technicalMinutes: number;
  operationsMinutes: number;
  evacuationMinutes: number;
  events: number;
  evacuationEvents: number;
  remarks: string[];
};

function aggregateRecords(records: DowntimeRecord[]): Map<string, DailyAggregate> {
  const aggregates = new Map<string, DailyAggregate>();
  for (const record of records.filter(item => item.status === "matched" && item.rideCode)) {
    const key = `${record.dateKey}|${record.rideCode}`;
    const current = aggregates.get(key) ?? {
      dateKey: record.dateKey,
      rideCode: record.rideCode!,
      attraction: record.attraction,
      technicalMinutes: 0,
      operationsMinutes: 0,
      evacuationMinutes: 0,
      events: 0,
      evacuationEvents: 0,
      remarks: [],
    };
    current.technicalMinutes += record.technicalMinutes;
    current.operationsMinutes += record.operationsMinutes;
    current.evacuationMinutes += record.evacuationMinutes;
    current.events += 1;
    if (record.evacuationEnd !== undefined) current.evacuationEvents += 1;
    const technicalRange = `${formatTime(record.technicalStart)}-${formatTime(record.technicalEnd)}`;
    const evacuationText = record.evacuationEnd === undefined ? "" : `, evac ${record.evacuationMinutes}mins (${formatTime(record.evacuationStart)}-${formatTime(record.evacuationEnd)})`;
    current.remarks.push(`*${record.dateLabel}, ${record.description}, ${record.technicalMinutes}mins (${technicalRange})${evacuationText}.`);
    aggregates.set(key, current);
  }
  return aggregates;
}

function prepareSummaryUpdates(aggregates: Map<string, DailyAggregate>, maps: TemplateMaps): Map<number, (rowXml: string) => string> {
  if (!maps.summarySheet) return new Map();
  const updates = new Map<number, Array<(rowXml: string) => string>>();
  for (const aggregate of Array.from(aggregates.values())) {
    const row = maps.summaryRows.get(aggregate.rideCode);
    const startColumn = maps.summaryDateColumns.get(aggregate.dateKey);
    if (!row || !startColumn) continue;
    const operations = [
      (xml: string) => setNumber(xml, `${numberToColumn(startColumn)}${row}`, aggregate.technicalMinutes),
      (xml: string) => setNumber(xml, `${numberToColumn(startColumn + 1)}${row}`, aggregate.technicalMinutes / DAILY_OPERATING_MINUTES),
      (xml: string) => setNumber(xml, `${numberToColumn(startColumn + 2)}${row}`, aggregate.events),
      (xml: string) => setNumber(xml, `${numberToColumn(startColumn + 4)}${row}`, aggregate.evacuationMinutes),
      (xml: string) => setNumber(xml, `${numberToColumn(startColumn + 5)}${row}`, aggregate.evacuationEvents),
      (xml: string) => setText(xml, `BC${row}`, aggregate.remarks.join("\n")),
    ];
    updates.set(row, [...(updates.get(row) ?? []), ...operations]);
  }
  return new Map(Array.from(updates.entries()).map(([row, operations]) => [row, (xml: string) => operations.reduce((output, operation) => operation(output), xml)]));
}

function prepareDailyRatioUpdates(aggregates: Map<string, DailyAggregate>, maps: TemplateMaps): Map<number, (rowXml: string) => string> {
  const entries = new Map<number, DailyAggregate>();
  for (const aggregate of Array.from(aggregates.values())) {
    const row = maps.timelineRows.get(`${timelineDateKey(aggregate.dateKey)}|${aggregate.rideCode}`);
    if (row) entries.set(row, aggregate);
  }
  return new Map(Array.from(entries.entries()).map(([row, aggregate]) => [row, (xml: string) => setNumber(xml, `D${row}`, aggregate.technicalMinutes / DAILY_OPERATING_MINUTES)]));
}

function markWorkbookForRecalculation(xml: string): string {
  if (/<calcPr\b/.test(xml)) return xml.replace(/<calcPr\b([^>]*)\/?\s*>/, (_match, attrs) => `<calcPr${attrs} fullCalcOnLoad="1" forceFullCalc="1"/>`);
  return xml.replace("</workbook>", `<calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
}

export async function processDowntimeWorkbooks(operationsBuffer: Buffer, templateBuffer: Buffer): Promise<ProcessingResult> {
  const [operationsZip, templateZip] = await Promise.all([JSZip.loadAsync(operationsBuffer), JSZip.loadAsync(templateBuffer)]);
  const [operationWorkbook, templateWorkbook] = await Promise.all([getSheets(operationsZip), getSheets(templateZip)]);
  const operationsSheet = operationWorkbook.sheets[0];
  if (!operationsSheet) throw new Error("The Operations workbook does not contain a downtime worksheet.");
  const records = parseOperations(operationsSheet, operationWorkbook.sharedStrings);
  if (records.length === 0) throw new Error("No downtime records with the 11-1 code were found in the Operations workbook.");
  const maps = buildTemplateMaps(templateWorkbook.sheets, templateWorkbook.sharedStrings);
  for (const record of records) {
    if (!record.dateKey) record.matchNote = "The source row does not include a usable date.";
    else if (!record.rideCode) record.matchNote = "The attraction is not mapped to a Technical template ride code.";
    else if (record.technicalStart === undefined || record.technicalEnd === undefined) record.matchNote = "A downtime start or ride-readiness time is missing.";
    else if (!maps.timelineRows.has(`${timelineDateKey(record.dateKey)}|${record.rideCode}`)) record.matchNote = "No matching date and ride row exists in the supplied Technical template.";
    else {
      record.status = "matched";
      record.matchNote = "Matched by source date and mapped Technical ride code; description and timing will be placed on the template timeline.";
    }
  }
  const aggregates = aggregateRecords(records);
  const timelineUpdates = prepareTimelineUpdates(records, maps);
  const dailyRatioUpdates = prepareDailyRatioUpdates(aggregates, maps);
  for (const [row, update] of Array.from(dailyRatioUpdates.entries())) {
    const previousUpdate = timelineUpdates.get(row);
    timelineUpdates.set(row, (xml: string) => update(previousUpdate ? previousUpdate(xml) : xml));
  }
  const timelineXml = changeRows(
    maps.timelineSheet.xml,
    timelineUpdates
  );
  templateZip.file(maps.timelineSheet.path, timelineXml);
  if (maps.summarySheet) {
    const summaryXml = changeRows(maps.summarySheet.xml, prepareSummaryUpdates(aggregates, maps));
    templateZip.file(maps.summarySheet.path, summaryXml);
  }
  templateZip.file("xl/workbook.xml", markWorkbookForRecalculation(await textFromZip(templateZip, "xl/workbook.xml")));
  const summaryByRide = Array.from(
    Array.from(aggregates.values())
    .reduce((summary, aggregate) => {
      const current = summary.get(aggregate.rideCode) ?? { rideCode: aggregate.rideCode, attraction: aggregate.attraction, minutes: 0, events: 0, evacuationMinutes: 0 };
      current.minutes += aggregate.technicalMinutes;
      current.events += aggregate.events;
      current.evacuationMinutes += aggregate.evacuationMinutes;
      summary.set(aggregate.rideCode, current);
      return summary;
    }, new Map<string, { rideCode: string; attraction: string; minutes: number; events: number; evacuationMinutes: number }>())
    .values()
  );
  const outputBuffer = await templateZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const outputDate = records.find(record => record.dateKey)?.dateKey ?? "downtime";
  return {
    records,
    matchedCount: records.filter(record => record.status === "matched").length,
    unmatchedCount: records.filter(record => record.status === "unmatched").length,
    totalTechnicalMinutes: records.reduce((total, record) => total + (record.status === "matched" ? record.technicalMinutes : 0), 0),
    totalOperationsMinutes: records.reduce((total, record) => total + (record.status === "matched" ? record.operationsMinutes : 0), 0),
    totalEvacuationMinutes: records.reduce((total, record) => total + (record.status === "matched" ? record.evacuationMinutes : 0), 0),
    summaryByRide: [...summaryByRide].sort((a, b) => b.minutes - a.minutes),
    outputBuffer,
    outputFileName: `Technical_Downtime_${outputDate}.xlsx`,
  };
}

export const __testables = { parseSharedStrings, parseRows, timelineDateKey, excelDateToKey, buildTemplateMaps, getSheets };
