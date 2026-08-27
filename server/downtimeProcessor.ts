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
  downtimePercentage: number;
  isClosed: boolean;
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
  totalNetworkPercentage: number;
  closedRideCount: number;
  summaryByRide: Array<{
    rideCode: string;
    attraction: string;
    minutes: number;
    events: number;
    evacuationMinutes: number;
    percentage: number;
    isClosed: boolean;
  }>;
  outputBuffer: Buffer;
  outputFileName: string;
};

const TECHNICAL_FILL_ID = "3";
const OPERATIONS_FILL_ID = "4";
const EVACUATION_FILL_ID = "17";
const CLOSED_FILL_ID = "10";
const DAILY_OPERATING_MINUTES = 480;
const FLEET_OPERATING_MINUTES = DAILY_OPERATING_MINUTES * 18;

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
    const code = row.cells.get("D")?.value.trim() ?? "";
    const isClosed = code.toUpperCase() === "CLOSED";
    if (code !== "11-1" && !isClosed) continue;
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
      downtimePercentage: isClosed ? 0 : (durationMinutes(technicalStart, technicalEnd) / DAILY_OPERATING_MINUTES) * 100,
      isClosed,
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
  dayRows: Map<string, { start: number; end: number }>;
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
  const dayRows = new Map<string, { start: number; end: number }>();
  let activeDate: string | undefined;
  for (const row of timelineRows) {
    const candidateDate = timelineDateKey(row.cells.get("A")?.value ?? "");
    if (candidateDate) activeDate = candidateDate;
    const code = row.cells.get("B")?.value.trim();
    if (activeDate && code) {
      timelineMap.set(`${activeDate}|${code}`, row.number);
      const range = dayRows.get(activeDate);
      dayRows.set(activeDate, range ? { start: range.start, end: row.number } : { start: row.number, end: row.number });
    }
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
  return { timelineSheet, summarySheet, timeStartColumn, timelineRows: timelineMap, dayRows, summaryRows, summaryDateColumns };
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

function setFormula(rowXml: string, reference: string, formula: string, cachedValue: number): string {
  return replaceCell(rowXml, reference, `><f>${escapeXml(formula)}</f><v>${Number.isFinite(cachedValue) ? cachedValue : 0}</v>`);
}

function setStyle(rowXml: string, reference: string, style: string): string {
  const existing = findCell(rowXml, reference);
  if (!existing) return replaceCell(rowXml, reference, `><v></v>`, style);
  const body = /<c\b[^>]*>([\s\S]*?)<\/c>/.exec(existing)?.[1] ?? "";
  return replaceCell(rowXml, reference, `>${body}`, style);
}

type TimelineStyleKind = "technical" | "operations" | "evacuation" | "closed";
type StyleVariants = {
  stylesheetXml: string;
  timeline: Record<TimelineStyleKind, Map<string, string>>;
  percentage: Map<string, string>;
};

function withXfAttributes(xf: string, attributes: Record<string, string>): string {
  const openTag = /<xf\b[^>]*(?:\/>|>)/.exec(xf)?.[0];
  if (!openTag) return xf;
  let updatedTag = openTag;
  for (const [name, value] of Object.entries(attributes)) {
    const attributePattern = new RegExp(`\\s${name}="[^"]*"`);
    updatedTag = attributePattern.test(updatedTag)
      ? updatedTag.replace(attributePattern, ` ${name}="${value}"`)
      : updatedTag.endsWith("/>")
        ? updatedTag.replace(/\/>$/, ` ${name}="${value}"/>`)
        : updatedTag.replace(/>$/, ` ${name}="${value}">`);
  }
  return xf.replace(openTag, updatedTag);
}

function extractCellXfs(content: string): string[] {
  const xfs: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf("<xf", cursor);
    if (start < 0) break;
    const tagEnd = content.indexOf(">", start);
    if (tagEnd < 0) break;
    const openTag = content.slice(start, tagEnd + 1);
    if (openTag.endsWith("/>")) {
      xfs.push(openTag);
      cursor = tagEnd + 1;
      continue;
    }
    const close = content.indexOf("</xf>", tagEnd);
    if (close < 0) break;
    xfs.push(content.slice(start, close + 5));
    cursor = close + 5;
  }
  return xfs;
}

function createStyleVariants(stylesheetXml: string): StyleVariants {
  const container = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(stylesheetXml);
  if (!container) throw new Error("The Technical template does not expose cell formatting definitions.");
  const xfs = extractCellXfs(container[2]);
  if (xfs.length === 0) throw new Error("The Technical template does not expose reusable cell formatting.");
  const fillIds: Record<TimelineStyleKind, string> = {
    technical: TECHNICAL_FILL_ID,
    operations: OPERATIONS_FILL_ID,
    evacuation: EVACUATION_FILL_ID,
    closed: CLOSED_FILL_ID,
  };
  const timeline = {
    technical: new Map<string, string>(),
    operations: new Map<string, string>(),
    evacuation: new Map<string, string>(),
    closed: new Map<string, string>(),
  };
  const percentage = new Map<string, string>();
  const additions: string[] = [];
  let nextStyle = xfs.length;
  xfs.forEach((xf, index) => {
    const base = String(index);
    (Object.keys(fillIds) as TimelineStyleKind[]).forEach(kind => {
      timeline[kind].set(base, String(nextStyle++));
      additions.push(withXfAttributes(xf, { fillId: fillIds[kind], applyFill: "1" }));
    });
    percentage.set(base, String(nextStyle++));
    additions.push(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1" }));
  });
  const updatedOpen = /\bcount="\d+"/.test(container[1])
    ? container[1].replace(/\bcount="\d+"/, `count="${nextStyle}"`)
    : container[1].replace(">", ` count="${nextStyle}">`);
  return {
    stylesheetXml: stylesheetXml.replace(container[0], `${updatedOpen}${container[2]}${additions.join("")}${container[3]}`),
    timeline,
    percentage,
  };
}

function deriveStyle(existingCell: string | undefined, variants: Map<string, string>): string {
  const originalStyle = existingCell ? styleFromCell(existingCell) ?? "0" : "0";
  return variants.get(originalStyle) ?? variants.get("0") ?? originalStyle;
}

function changeRows(xml: string, updates: Map<number, (rowXml: string) => string>): string {
  return xml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (complete, attrs) => {
    const rowNumber = Number(attribute(attrs, "r") ?? "0");
    return updates.get(rowNumber)?.(complete) ?? complete;
  });
}

function prepareTimelineUpdates(records: DowntimeRecord[], maps: TemplateMaps, variants: StyleVariants): Map<number, (rowXml: string) => string> {
  const byRow = new Map<number, DowntimeRecord[]>();
  for (const record of records.filter(item => item.status === "matched" && item.rideCode && (item.isClosed || (item.technicalStart !== undefined && item.technicalEnd !== undefined)))) {
    const key = `${timelineDateKey(record.dateKey)}|${record.rideCode}`;
    const row = maps.timelineRows.get(key);
    if (!row) continue;
    byRow.set(row, [...(byRow.get(row) ?? []), record]);
  }
  const updates = new Map<number, (rowXml: string) => string>();
  for (const [rowNumber, rowRecords] of Array.from(byRow.entries())) {
    updates.set(rowNumber, rowXml => {
      const cellStyles = new Map<string, { kind: TimelineStyleKind; priority: number }>();
      const descriptions: Array<{ reference: string; value: string }> = [];
      const setRange = (start: number | undefined, end: number | undefined, kind: TimelineStyleKind, priority: number) => {
        if (start === undefined || end === undefined) return;
        const finalEnd = end >= start ? end : end + 1440;
        for (let minute = start; minute <= finalEnd; minute++) {
          const column = maps.timeStartColumn + (minute % 1440) - 600;
          if (column < maps.timeStartColumn) continue;
          const reference = `${numberToColumn(column)}${rowNumber}`;
          const previous = cellStyles.get(reference);
          if (!previous || priority >= previous.priority) cellStyles.set(reference, { kind, priority });
        }
      };
      for (const record of rowRecords) {
        if (record.isClosed) {
          setRange(600, 1079, "closed", 4);
          descriptions.push({ reference: `${numberToColumn(maps.timeStartColumn)}${rowNumber}`, value: `Closed — ${record.description}` });
          continue;
        }
        setRange(record.technicalStart, record.technicalEnd, "technical", 1);
        if (record.operationsEnd !== undefined && record.technicalEnd !== undefined) {
          setRange(record.technicalEnd + 1, record.operationsEnd, "operations", 2);
        }
        setRange(record.evacuationStart, record.evacuationEnd, "evacuation", 3);
        const labelColumn = Math.max(maps.timeStartColumn, maps.timeStartColumn + (record.technicalStart! % 1440) - 605);
        descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: record.description });
      }
      let revised = rowXml;
      for (const description of descriptions) revised = setText(revised, description.reference, description.value);
      for (const [reference, detail] of Array.from(cellStyles.entries())) {
        revised = setStyle(revised, reference, deriveStyle(findCell(revised, reference), variants.timeline[detail.kind]));
      }
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
  for (const record of records.filter(item => item.status === "matched" && item.rideCode && !item.isClosed)) {
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

function prepareDailyPercentageUpdates(aggregates: Map<string, DailyAggregate>, maps: TemplateMaps, variants: StyleVariants): Map<number, (rowXml: string) => string> {
  const entries = new Map<number, DailyAggregate>();
  for (const aggregate of Array.from(aggregates.values())) {
    const row = maps.timelineRows.get(`${timelineDateKey(aggregate.dateKey)}|${aggregate.rideCode}`);
    if (row) entries.set(row, aggregate);
  }
  return new Map(Array.from(entries.entries()).map(([row, aggregate]) => [row, (xml: string) => {
    const percentageReference = `D${row}`;
    let revised = setFormula(xml, percentageReference, `${aggregate.technicalMinutes}/${DAILY_OPERATING_MINUTES}`, aggregate.technicalMinutes / DAILY_OPERATING_MINUTES);
    revised = setStyle(revised, percentageReference, deriveStyle(findCell(revised, percentageReference), variants.percentage));
    const dayKey = timelineDateKey(aggregate.dateKey);
    const dayRange = dayKey ? maps.dayRows.get(dayKey) : undefined;
    if (dayRange?.start === row) {
      const totalMinutes = Array.from(aggregates.values())
        .filter(item => timelineDateKey(item.dateKey) === dayKey)
        .reduce((total, item) => total + item.technicalMinutes, 0);
      const totalReference = `E${row}`;
      revised = setFormula(revised, totalReference, `SUM(D${dayRange.start}:D${dayRange.end})/18`, totalMinutes / FLEET_OPERATING_MINUTES);
      revised = setStyle(revised, totalReference, deriveStyle(findCell(revised, totalReference), variants.percentage));
    }
    return revised;
  }]));
}

export async function processDowntimeWorkbooks(operationsBuffer: Buffer, templateBuffer: Buffer): Promise<ProcessingResult> {
  const [operationsZip, templateZip] = await Promise.all([JSZip.loadAsync(operationsBuffer), JSZip.loadAsync(templateBuffer)]);
  const [operationWorkbook, templateWorkbook] = await Promise.all([getSheets(operationsZip), getSheets(templateZip)]);
  const operationsSheet = operationWorkbook.sheets[0];
  if (!operationsSheet) throw new Error("The Operations workbook does not contain a downtime worksheet.");
  const records = parseOperations(operationsSheet, operationWorkbook.sharedStrings);
  if (records.length === 0) throw new Error("No downtime records with the 11-1 code were found in the Operations workbook.");
  const maps = buildTemplateMaps(templateWorkbook.sheets, templateWorkbook.sharedStrings);
  const styleVariants = createStyleVariants(await textFromZip(templateZip, "xl/styles.xml"));
  templateZip.file("xl/styles.xml", styleVariants.stylesheetXml);
  for (const record of records) {
    if (!record.dateKey) record.matchNote = "The source row does not include a usable date.";
    else if (!record.rideCode) record.matchNote = "The attraction is not mapped to a Technical template ride code.";
    else if (record.isClosed && !maps.timelineRows.has(`${timelineDateKey(record.dateKey)}|${record.rideCode}`)) record.matchNote = "No matching date and ride row exists in the supplied Technical template.";
    else if (record.isClosed) {
      record.status = "matched";
      record.matchNote = "Closed ride detected; the full 10:00–18:00 operating period will receive the template’s closure color.";
    }
    else if (record.technicalStart === undefined || record.technicalEnd === undefined) record.matchNote = "A downtime start or ride-readiness time is missing.";
    else if (!maps.timelineRows.has(`${timelineDateKey(record.dateKey)}|${record.rideCode}`)) record.matchNote = "No matching date and ride row exists in the supplied Technical template.";
    else {
      record.status = "matched";
      record.matchNote = "Matched by source date and mapped Technical ride code; description and timing will be placed on the template timeline.";
    }
  }
  const aggregates = aggregateRecords(records);
  const timelineUpdates = prepareTimelineUpdates(records, maps, styleVariants);
  const dailyPercentageUpdates = prepareDailyPercentageUpdates(aggregates, maps, styleVariants);
  for (const [row, update] of Array.from(dailyPercentageUpdates.entries())) {
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
  const summaryByRide = Array.from(
    records.filter(record => record.status === "matched" && record.rideCode)
    .reduce((summary, record) => {
      const current = summary.get(record.rideCode!) ?? { rideCode: record.rideCode!, attraction: record.attraction, minutes: 0, events: 0, evacuationMinutes: 0, percentage: 0, isClosed: false };
      if (record.isClosed) current.isClosed = true;
      else {
        current.minutes += record.technicalMinutes;
        current.events += 1;
        current.evacuationMinutes += record.evacuationMinutes;
      }
      current.percentage = (current.minutes / DAILY_OPERATING_MINUTES) * 100;
      summary.set(record.rideCode!, current);
      return summary;
    }, new Map<string, { rideCode: string; attraction: string; minutes: number; events: number; evacuationMinutes: number; percentage: number; isClosed: boolean }>())
    .values()
  );
  const outputBuffer = await templateZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const outputDate = records.find(record => record.dateKey)?.dateKey ?? "downtime";
  return {
    records,
    matchedCount: records.filter(record => record.status === "matched" && !record.isClosed).length,
    unmatchedCount: records.filter(record => record.status === "unmatched").length,
    totalTechnicalMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed ? record.technicalMinutes : 0), 0),
    totalOperationsMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed ? record.operationsMinutes : 0), 0),
    totalEvacuationMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed ? record.evacuationMinutes : 0), 0),
    totalNetworkPercentage: (records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed ? record.technicalMinutes : 0), 0) / FLEET_OPERATING_MINUTES) * 100,
    closedRideCount: records.filter(record => record.status === "matched" && record.isClosed).length,
    summaryByRide: [...summaryByRide].sort((a, b) => b.minutes - a.minutes),
    outputBuffer,
    outputFileName: `Technical_Downtime_${outputDate}.xlsx`,
  };
}

export const __testables = { parseSharedStrings, parseRows, timelineDateKey, excelDateToKey, buildTemplateMaps, getSheets };
