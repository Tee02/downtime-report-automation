import ExcelJS from "exceljs";
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
  isFireAlarm: boolean;
  isLateHandover: boolean;
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
  totalEvacuationEvents: number;
  totalNetworkPercentage: number;
  closedRideCount: number;
  weatherIntervalCount: number;
  fireAlarmCount: number;
  weatherText?: string;
  outputDate?: string;
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

export type ProcessingOptions = {
  manualClosedRideCodes?: string[];
  weatherText?: string;
  parkCloseTimes?: Record<string, string>;
};

export type MappedWorkbookPart = {
  reportDate: string;
  buffer: Buffer;
};

export type DowntimeLogCell = { column: string; value: string; style?: string };
export type DowntimeLogRow = {
  dateKey?: string;
  attraction?: string;
  rideCode?: string;
  cells: DowntimeLogCell[];
};

const TECHNICAL_FILL_ID = "3";
const OPERATIONS_FILL_ID = "4";
const EVACUATION_FILL_ID = "7";
const CLOSED_FILL_HEX = "FFF8CBAD";
const WEATHER_FILL_HEX = "FFFFE699";
const FIRE_ALARM_FILL_HEX = "FF00CC99";
const LATE_HANDOVER_FILL_HEX = "FF000000";
const DAILY_OPERATING_MINUTES = 480;
const FLEET_OPERATING_MINUTES = DAILY_OPERATING_MINUTES * 19;

const ATTRACTION_CODES: Record<string, string> = {
  ACR: "ACR",
  ACORNADVENTURE: "ACR",
  ETI: "ETI",
  EXPEDITIONTHINICE: "ETI",
  ICEAGEEXPEDITIONTHINICE: "ETI",
  MFZ: "MFZ",
  MAMMOTHFUNZONE: "MFZ",
  AFP: "AFP",
  ALPHAFIGHTERPILOTS: "AFP",
  BSC: "BSC",
  BLUESKYCAROUSEL: "BSC",
  BWZ: "BWZ",
  BIGWELDSZEPPELINS: "BWZ",
  BIGWELDSZEPPELIN: "BWZ",
  EHF: "EHF",
  EPICHUMMINGBIRDFLYERS: "EHF",
  ESD: "ESD",
  ESDGLOBALDEFENDER: "ESD",
  GLOBALDEFENDER: "ESD",
  IDD: "IDD",
  INDEPENDENCEDAYDEFIANCE: "IDD",
  DEFIANCE: "IDD",
  EPICVOYAGETOMOONHAVEN: "VTM",
  VTM: "VTM",
  NTM: "NTM",
  NATM: "NTM",
  NIGHTATTHEMUSEUM: "NTM",
  NIGHTTIMEWONDERLAND: "NTM",
  PTA: "PTA",
  INVASIONOFTHEPLANETOFTHEAPES: "PTA",
  RCC: "RCC",
  RIOCARNAVALCHAOS: "RCC",
  RTR: "RTR",
  RIVETTOWNROLLER: "RTR",
  SAG: "SAG",
  SAMBAGLIDERS: "SAG",
  SIDESHOWGAMES: "SAG",
  SRS: "SRS",
  SIDSROCKNSLIDE: "SRS",
  TTC: "TTC",
  TERRAFORMTOWERCHALLENGE: "TTC",
  BCTEV: "BCT (EV)",
  BOOTCAMPTRAININGEXTREMEVERT: "BCT (EV)",
  EXTREMEVERT: "BCT (EV)",
  BCTRC: "BCT (RC)",
  BOOTCAMPTRAININGROPESCOURSE: "BCT (RC)",
  ROPESCOURSE: "BCT (RC)",
  BCTUZ: "BCT (UZ)",
  BOOTCAMPTRAININGUNHARNESSZONES: "BCT (UZ)",
  BOOTCAMPTRAININGUNHARNESSEDZONES: "BCT (UZ)",
  UNHARNESSZONES: "BCT (UZ)",
  UNHARNESSEDZONES: "BCT (UZ)",
  BCTZC: "BCT (ZC)",
  BOOTCAMPTRAININGZIPCOASTER: "BCT (ZC)",
  ZIPCOASTER: "BCT (ZC)",
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

function withCenterAlignment(xf: string): string {
  let result = withXfAttributes(xf, { applyAlignment: "1" });
  if (result.includes("<alignment")) {
    result = result.replace(/<alignment\b[^>]*\/?>/, '<alignment horizontal="center" vertical="center"/>');
  } else if (result.endsWith("/>")) {
    result = result.replace(/\/>$/, '><alignment horizontal="center" vertical="center"/></xf>');
  } else if (result.includes("</xf>")) {
    result = result.replace("</xf>", '<alignment horizontal="center" vertical="center"/></xf>');
  }
  return result;
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

export function resolveRideCode(attraction: string, description = ""): string | undefined {
  const direct = ATTRACTION_CODES[normalizeText(attraction)];
  if (direct) return direct;
  const context = normalizeText(`${attraction} ${description}`);
  if (context.includes("BOOTCAMP") || context.includes("BCT")) {
    if (context.includes("EXTREMEVERT") || context.includes("EV")) return "BCT (EV)";
    if (context.includes("ROPESCOURSE") || context.includes("RC")) return "BCT (RC)";
    if (context.includes("UNHARNESSZONES") || context.includes("UNHARNESSED") || context.includes("UZ")) return "BCT (UZ)";
    if (context.includes("ZIPCOASTER") || context.includes("ZC")) return "BCT (ZC)";
  }
  return ATTRACTION_CODES[context];
}

export type WeatherInterval = {
  dateKey: string;
  rideCode: string;
  startedAt: number;
  resumedAt: number;
  minutes: number;
  condition: string;
};

type WeatherUpdateKind = "start" | "resume";

const WEATHER_CONDITIONS: Record<string, string> = {
  BLUE: "10-13 Blue",
  GREEN: "10-13 Green",
  ORANGE: "10-13 Orange",
  PURPLE: "10-13 Purple",
};

function parseWeatherTime(value: string): number | undefined {
  const match = /@\s*:?[\s]*(\d{1,2}:?\d{2})\s*H?\b/i.exec(value);
  return match ? parseTimeToMinutes(match[1]) : undefined;
}

function weatherConditionFromText(value: string): string | undefined {
  const color = /10\s*-\s*13\s*(blue|green|orange|purple)\b/i.exec(value)?.[1]?.toUpperCase();
  return color ? WEATHER_CONDITIONS[color] : undefined;
}

function weatherKindFromText(value: string): WeatherUpdateKind | undefined {
  const code = /\b11\s*-\s*([38])\s*:/i.exec(value)?.[1];
  return code === "3" ? "start" : code === "8" ? "resume" : undefined;
}

function rideFromWeatherLine(value: string): string | undefined {
  const codeMatch = /\b11\s*-\s*[38]\s*:/i.exec(value);
  const timeIndex = value.search(/@\s*:?[\s]*\d{1,2}:?\d{2}\s*H?\b/i);
  const beforeTime = timeIndex >= 0 ? value.slice(0, timeIndex) : value;
  const candidates = codeMatch
    ? [value.slice(0, codeMatch.index), value.slice(codeMatch.index + codeMatch[0].length, timeIndex >= 0 ? timeIndex : undefined), beforeTime]
    : [beforeTime];
  return candidates.map(candidate => resolveRideCode(candidate)).find((rideCode): rideCode is string => Boolean(rideCode));
}

/**
 * Pairs pasted 11-3 weather starts and 11-8 resume updates for recognised rides.
 * An unlabelled 11-8 update is applied only when exactly one weather start is pending.
 */
export function parseWeatherIntervals(value: string, dateKey: string): WeatherInterval[] {
  const pending = new Map<string, { startedAt: number; condition: string }>();
  const intervals: WeatherInterval[] = [];
  let activeKind: WeatherUpdateKind | undefined;
  let activeCondition: string | undefined;

  const closeInterval = (rideCode: string, resumedAt: number) => {
    const start = pending.get(rideCode);
    if (!start) return;
    pending.delete(rideCode);
    intervals.push({
      dateKey,
      rideCode,
      startedAt: start.startedAt,
      resumedAt,
      minutes: durationMinutes(start.startedAt, resumedAt),
      condition: start.condition,
    });
  };

  for (const rawLine of value.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const lineKind = weatherKindFromText(line);
    if (lineKind) {
      activeKind = lineKind;
      activeCondition = weatherConditionFromText(line) ?? activeCondition;
    }
    if (!activeKind) continue;

    const time = parseWeatherTime(line);
    if (time === undefined) continue;
    const rideCode = rideFromWeatherLine(line);
    if (activeKind === "start" && rideCode) {
      pending.set(rideCode, { startedAt: time, condition: weatherConditionFromText(line) ?? activeCondition ?? "Inclement Weather" });
      continue;
    }
    if (activeKind === "resume") {
      if (rideCode) closeInterval(rideCode, time);
      else if (pending.size === 1) closeInterval(Array.from(pending.keys())[0]!, time);
    }
  }
  return intervals;
}

/**
 * Automatically extracts 11-3 Weather rows directly from an uploaded Operations downtime log sheet.
 */
export function parseWorkbookWeatherIntervals(recordsSheet: SheetInfo, sharedStrings: string[], fallbackDateKey = ""): WeatherInterval[] {
  const rows = parseRows(recordsSheet.xml, sharedStrings);
  const intervals: WeatherInterval[] = [];
  for (const row of rows) {
    const code = row.cells.get("D")?.value.trim() ?? "";
    const department = row.cells.get("C")?.value.trim() ?? "";
    const description = row.cells.get("F")?.value.trim() ?? "";
    const attraction = row.cells.get("B")?.value.trim() ?? "";

    const isWeather =
      department.toUpperCase() === "WEATHER" ||
      code.toUpperCase() === "11-3" ||
      /weather/i.test(department) ||
      /weather/i.test(description) ||
      /inclement/i.test(description);

    if (!isWeather) continue;

    const rideCode = resolveRideCode(attraction, description);
    if (!rideCode) continue;

    const rawDate = row.cells.get("A")?.value ?? "";
    const recordDateKey = excelDateToKey(rawDate) || fallbackDateKey;

    const startedAt = parseTimeToMinutes(row.cells.get("G")?.value ?? "");
    const resumedAt = parseTimeToMinutes(row.cells.get("H")?.value ?? "");
    if (startedAt === undefined || resumedAt === undefined) continue;

    const condition =
      weatherConditionFromText(description) ??
      (/10\s*-\s*13\s*(blue|green|orange|purple)\b/i.exec(description)?.[1]
        ? `10-13 ${/10\s*-\s*13\s*(blue|green|orange|purple)\b/i.exec(description)![1].charAt(0).toUpperCase() + /10\s*-\s*13\s*(blue|green|orange|purple)\b/i.exec(description)![1].slice(1).toLowerCase()}`
        : "Inclement Weather");

    intervals.push({
      dateKey: recordDateKey,
      rideCode,
      startedAt,
      resumedAt,
      minutes: durationMinutes(startedAt, resumedAt),
      condition,
    });
  }
  return intervals;
}

export function formatWeatherIntervalsToText(intervals: WeatherInterval[]): string {
  if (!intervals.length) return "";
  return intervals
    .map(
      interval =>
        `${interval.rideCode} - 11-3: Inclement Weather (${interval.condition}) @${formatTime(interval.startedAt)}H\n11-8: @${formatTime(interval.resumedAt)}H`
    )
    .join("\n\n");
}

export async function readWeatherIntervalsFromBuffer(operationsBuffer: Buffer, fallbackDateKey = ""): Promise<WeatherInterval[]> {
  const zip = await JSZip.loadAsync(operationsBuffer);
  const workbook = await getSheets(zip);
  const sheet = workbook.sheets[0];
  if (!sheet) return [];
  return parseWorkbookWeatherIntervals(sheet, workbook.sharedStrings, fallbackDateKey);
}

function parseOperations(recordsSheet: SheetInfo, sharedStrings: string[]): DowntimeRecord[] {
  const rows = parseRows(recordsSheet.xml, sharedStrings);
  const results: DowntimeRecord[] = [];
  for (const row of rows) {
    const code = row.cells.get("D")?.value.trim() ?? "";
    const department = row.cells.get("C")?.value.trim() ?? "";
    const description = row.cells.get("F")?.value.trim() ?? "";
    const isTechnical = department.toUpperCase() === "TECHNICAL";
    const isFireAlarm =
      code.toUpperCase() === "11-10" &&
      (/fire\s*alarm/i.test(description) || /signal\s*29/i.test(description) || /signal29/i.test(description));
    const isTechnicalClosure = code.toUpperCase() === "CLOSED" && /technical|maintenance|ndt/i.test(description);
    const isClosed = isTechnicalClosure;
    if (!((code === "11-1" && isTechnical) || isTechnicalClosure || isFireAlarm)) continue;
    const rawDate = row.cells.get("A")?.value ?? "";
    const recordDateKey = excelDateToKey(rawDate);
    const attraction = row.cells.get("B")?.value.trim() ?? "";
    const technicalStart = parseTimeToMinutes(row.cells.get("G")?.value ?? "");
    const technicalEnd = parseTimeToMinutes(row.cells.get("H")?.value ?? "");
    const operationsEnd = parseTimeToMinutes(row.cells.get("J")?.value ?? "");
    const providedEvacuationStart = parseTimeToMinutes(row.cells.get("M")?.value ?? "");
    const evacuationEnd = parseTimeToMinutes(row.cells.get("N")?.value ?? "");
    const evacuationStart = providedEvacuationStart;
    const record: DowntimeRecord = {
      sourceRow: row.number,
      dateKey: recordDateKey ?? "",
      dateLabel: recordDateKey ? dateLabel(recordDateKey) : "Unknown date",
      attraction,
      rideCode: resolveRideCode(attraction, description),
      department,
      description,
      technicalStart,
      technicalEnd,
      operationsEnd,
      evacuationStart,
      evacuationEnd,
      technicalMinutes: durationMinutes(technicalStart, technicalEnd),
      operationsMinutes: durationMinutes(technicalEnd, operationsEnd),
      evacuationMinutes: durationMinutes(evacuationStart, evacuationEnd),
      downtimePercentage: isClosed || isFireAlarm ? 0 : (durationMinutes(technicalStart, technicalEnd) / DAILY_OPERATING_MINUTES) * 100,
      isClosed,
      isFireAlarm,
      isLateHandover: !isFireAlarm && /\blate\s+(?:technical\s+)?handover\b/i.test(description),
      status: "unmatched",
      matchNote: "Awaiting template match",
    };
    results.push(record);
  }
  return results;
}

export async function readTechnicalDowntimeRecords(operationsBuffer: Buffer): Promise<DowntimeRecord[]> {
  const zip = await JSZip.loadAsync(operationsBuffer);
  const workbook = await getSheets(zip);
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("The saved source log does not contain a downtime worksheet.");
  return parseOperations(sheet, workbook.sharedStrings);
}

async function readDowntimeLogRows(operationsBuffer: Buffer): Promise<{ headerRows: DowntimeLogRow[]; dataRows: DowntimeLogRow[] }> {
  const zip = await JSZip.loadAsync(operationsBuffer);
  const workbook = await getSheets(zip);
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("The saved source log does not contain a downtime worksheet.");
  let activeDateKey: string | undefined;
  const rows = parseRows(sheet.xml, workbook.sharedStrings).map(row => {
    const rawDate = row.cells.get("A")?.value ?? "";
    activeDateKey = excelDateToKey(rawDate) ?? activeDateKey;
    const attraction = row.cells.get("B")?.value.trim();
    return {
      sourceRow: row.number,
      dateKey: activeDateKey,
      attraction,
      rideCode: attraction ? resolveRideCode(attraction, row.cells.get("F")?.value ?? "") : undefined,
      cells: Array.from(row.cells.values()).map(cell => ({ column: cell.column, value: cell.value, style: cell.style })),
    };
  });
  const firstDataRow = rows.find(row => row.dateKey && row.attraction)?.sourceRow;
  return {
    headerRows: rows.filter(row => firstDataRow !== undefined && row.sourceRow < firstDataRow).map(({ sourceRow: _sourceRow, ...row }) => row),
    dataRows: rows.filter(row => row.dateKey && row.attraction).map(({ sourceRow: _sourceRow, ...row }) => row),
  };
}

function rowToXml(row: DowntimeLogRow, rowNumber: number): string {
  const cells = row.cells
    .filter(cell => cell.value || cell.style)
    .sort((left, right) => columnToNumber(left.column) - columnToNumber(right.column))
    .map(cell => {
      const value = cell.column === "A" && row.dateKey ? row.dateKey.split("-").reverse().join("/") : cell.value;
      return `<c r="${cell.column}${rowNumber}"${cell.style ? ` s="${cell.style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    })
    .join("");
  return `<row r="${rowNumber}">${cells}</row>`;
}

export async function compileDowntimeLogExport(sources: Array<{ reportDate: string; buffer: Buffer }>, selectedRideCodes: string[]): Promise<Buffer> {
  if (!sources.length) throw new Error("Select at least one saved report before exporting.");
  const sourceRows = [] as Array<{ reportDate: string; headerRows: DowntimeLogRow[]; dataRows: DowntimeLogRow[] }>;
  for (const source of sources) {
    sourceRows.push({ reportDate: source.reportDate, ...(await readDowntimeLogRows(source.buffer)) });
  }
  const selectedCodes = new Set(selectedRideCodes);
  const rows = sourceRows
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate))
    .flatMap(source => source.dataRows.filter(row => selectedCodes.size === 0 || (row.rideCode && selectedCodes.has(row.rideCode))));
  const primaryZip = await JSZip.loadAsync(sources[0]!.buffer);
  const primaryWorkbook = await getSheets(primaryZip);
  const primarySheet = primaryWorkbook.sheets[0];
  if (!primarySheet) throw new Error("The saved source log does not contain a downtime worksheet.");
  const headerRows = sourceRows[0]?.headerRows ?? [];
  const sheetData = [...headerRows, ...rows].map((row, index) => rowToXml(row, index + 1)).join("");
  const compiledSheet = primarySheet.xml
    .replace(/<dimension\b[^>]*\/>/, "")
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetData}</sheetData>`);
  primaryZip.file(primarySheet.path, compiledSheet);
  const outputName = "Compiled Downtime Log";
  primaryZip.file("xl/workbook.xml", updateSheetName(await textFromZip(primaryZip, "xl/workbook.xml"), primarySheet.name, outputName));
  return primaryZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function mappedSheetName(reportDate: string): string {
  const date = new Date(`${reportDate}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).replace(/ /g, "-");
}

export async function combineMappedWorkbooks(parts: MappedWorkbookPart[]): Promise<Buffer> {
  if (!parts.length) throw new Error("Select at least one saved downtime log before building the Mapping Excel.");
  const orderedParts = [...parts].sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  if (orderedParts.length === 1) return orderedParts[0]!.buffer;

  const combined = new ExcelJS.Workbook();
  combined.creator = "SkyWorlds Downtime Studio";
  combined.created = new Date();
  combined.modified = new Date();

  for (const part of orderedParts) {
    const source = new ExcelJS.Workbook();
    await source.xlsx.load(part.buffer as unknown as ExcelJS.Buffer);
    const sourceSheet = source.worksheets[0];
    if (!sourceSheet) throw new Error(`The mapped workbook for ${part.reportDate} does not contain a worksheet.`);

    const destination = combined.addWorksheet(mappedSheetName(part.reportDate));
    destination.model = {
      ...structuredClone(sourceSheet.model),
      id: destination.id,
      name: destination.name,
    };
  }

  const output = await combined.xlsx.writeBuffer();
  return Buffer.from(output);
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

function buildTemplateMaps(sheets: SheetInfo[], sharedStrings: string[], reportDateKey: string): TemplateMaps {
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
  const fallbackDate = timelineDateKey(reportDateKey);
  for (const row of timelineRows) {
    const candidateDate = timelineDateKey(row.cells.get("A")?.value ?? "");
    if (candidateDate) activeDate = candidateDate;
    const code = row.cells.get("B")?.value.trim();
    const rowDate = activeDate ?? fallbackDate;
    if (rowDate && code && row.number >= 4) {
      timelineMap.set(`${rowDate}|${code}`, row.number);
      const range = dayRows.get(rowDate);
      dayRows.set(rowDate, range ? { start: range.start, end: row.number } : { start: row.number, end: row.number });
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

function setRichText(rowXml: string, reference: string, parts: Array<{ value: string; color?: string }>): string {
  const runs = parts.map(part => `<r>${part.color ? `<rPr><color rgb="${part.color}"/></rPr>` : ""}<t xml:space="preserve">${escapeXml(part.value)}</t></r>`).join("");
  return replaceCell(rowXml, reference, ` t="inlineStr"><is>${runs}</is>`);
}

function clearCell(rowXml: string, reference: string): string {
  const existing = findCell(rowXml, reference);
  if (!existing) return rowXml;
  const style = styleFromCell(existing);
  return rowXml.replace(existing, `<c r="${reference}"${style ? ` s="${style}"` : ""}/>`);
}

function setFormula(rowXml: string, reference: string, formula: string, cachedValue: number): string {
  return replaceCell(rowXml, reference, `><f>${escapeXml(formula)}</f><v>${Number.isFinite(cachedValue) ? cachedValue : 0}</v>`);
}

function setStyle(rowXml: string, reference: string, style: string): string {
  const existing = findCell(rowXml, reference);
  if (!existing) return replaceCell(rowXml, reference, `><v></v>`, style);
  const body = existing.endsWith("/>") ? "" : /<c\b[^>]*>([\s\S]*?)<\/c>/.exec(existing)?.[1] ?? "";
  return replaceCell(rowXml, reference, `>${body}`, style);
}

type TimelineStyleKind = "technical" | "lateHandover" | "operations" | "evacuation" | "weather" | "fireAlarm" | "closed" | "blank" | "parkClose";
type StyleVariants = {
  stylesheetXml: string;
  timeline: Record<TimelineStyleKind, Map<string, string>>;
  lateHandoverText: Map<string, string>;
  percentage: Map<string, string>;
  percentageAlert: Map<string, string>;
  availability: Record<"standard" | "downtime" | "closed", Map<string, string>>;
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

function addClosedRideFill(stylesheetXml: string): { stylesheetXml: string; fillId: string } {
  return addSolidFill(stylesheetXml, CLOSED_FILL_HEX);
}

function addSolidFill(stylesheetXml: string, rgb: string): { stylesheetXml: string; fillId: string } {
  const container = /(<fills\b[^>]*>)([\s\S]*?)(<\/fills>)/.exec(stylesheetXml);
  if (!container) throw new Error("The Technical template does not expose fill definitions.");
  const existingFill = Array.from(container[2].matchAll(/<fill\b/g)).length;
  const open = /\bcount="\d+"/.test(container[1])
    ? container[1].replace(/\bcount="\d+"/, `count="${existingFill + 1}"`)
    : container[1].replace(">", ` count="${existingFill + 1}">`);
  const fill = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  return {
    stylesheetXml: stylesheetXml.replace(container[0], `${open}${container[2]}${fill}${container[3]}`),
    fillId: String(existingFill),
  };
}

function addColorFonts(stylesheetXml: string, color: string): { stylesheetXml: string; fontIds: Map<string, string> } {
  const container = /(<fonts\b[^>]*>)([\s\S]*?)(<\/fonts>)/.exec(stylesheetXml);
  if (!container) throw new Error("The Technical template does not expose font definitions.");
  const fonts = Array.from(container[2].matchAll(/<font\b[^>]*(?:\/>|>[\s\S]*?<\/font>)/g)).map(match => match[0]);
  if (fonts.length === 0) throw new Error("The Technical template does not expose reusable font definitions.");
  const fontIds = new Map<string, string>();
  const additions: string[] = [];
  fonts.forEach((font, index) => {
    const coloredFont = /<color\b[^>]*\/?\s*>/.test(font)
      ? font.replace(/<color\b[^>]*\/?\s*>/, `<color rgb="${color}"/>`)
      : font.endsWith("/>")
        ? `<font><color rgb="${color}"/></font>`
        : font.replace(/<font\b([^>]*)>/, `<font$1><color rgb="${color}"/>`);
    fontIds.set(String(index), String(fonts.length + index));
    additions.push(coloredFont);
  });
  const open = /\bcount="\d+"/.test(container[1])
    ? container[1].replace(/\bcount="\d+"/, `count="${fonts.length * 2}"`)
    : container[1].replace(">", ` count="${fonts.length * 2}">`);
  return { stylesheetXml: stylesheetXml.replace(container[0], `${open}${container[2]}${additions.join("")}${container[3]}`), fontIds };
}

function createStyleVariants(stylesheetXml: string): StyleVariants {
  const withClosedFill = addClosedRideFill(stylesheetXml);
  const withWeatherFill = addSolidFill(withClosedFill.stylesheetXml, WEATHER_FILL_HEX);
  const withFireAlarmFill = addSolidFill(withWeatherFill.stylesheetXml, FIRE_ALARM_FILL_HEX);
  const withLateHandoverFill = addSolidFill(withFireAlarmFill.stylesheetXml, LATE_HANDOVER_FILL_HEX);
  const withParkCloseFill = addSolidFill(withLateHandoverFill.stylesheetXml, "FFFF0000");
  const withAvailabilityFill = addSolidFill(withParkCloseFill.stylesheetXml, "FFFFF2CC");
  const withRedFonts = addColorFonts(withAvailabilityFill.stylesheetXml, "FFFF0000");
  const withPurpleFonts = addColorFonts(withRedFonts.stylesheetXml, "FF7030A0");
  const container = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(withPurpleFonts.stylesheetXml);
  if (!container) throw new Error("The Technical template does not expose cell formatting definitions.");
  const xfs = extractCellXfs(container[2]);
  if (xfs.length === 0) throw new Error("The Technical template does not expose reusable cell formatting.");
  const fillIds: Record<TimelineStyleKind, string> = {
    technical: TECHNICAL_FILL_ID,
    operations: OPERATIONS_FILL_ID,
    evacuation: EVACUATION_FILL_ID,
    weather: withWeatherFill.fillId,
    fireAlarm: withFireAlarmFill.fillId,
    lateHandover: withLateHandoverFill.fillId,
    closed: withClosedFill.fillId,
    blank: "0",
    parkClose: withParkCloseFill.fillId,
  };
  const timeline = {
    technical: new Map<string, string>(),
    lateHandover: new Map<string, string>(),
    operations: new Map<string, string>(),
    evacuation: new Map<string, string>(),
    weather: new Map<string, string>(),
    fireAlarm: new Map<string, string>(),
    closed: new Map<string, string>(),
    blank: new Map<string, string>(),
    parkClose: new Map<string, string>(),
  };
  const percentage = new Map<string, string>();
  const percentageAlert = new Map<string, string>();
  const lateHandoverText = new Map<string, string>();
  const availability = { standard: new Map<string, string>(), downtime: new Map<string, string>(), closed: new Map<string, string>() };
  const additions: string[] = [];
  let nextStyle = xfs.length;
  xfs.forEach((xf, index) => {
    const base = String(index);
    (Object.keys(fillIds) as TimelineStyleKind[]).forEach(kind => {
      timeline[kind].set(base, String(nextStyle++));
      additions.push(withXfAttributes(xf, { fillId: fillIds[kind], applyFill: "1" }));
    });
    percentage.set(base, String(nextStyle++));
    additions.push(withCenterAlignment(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1", fillId: "0", applyFill: "1" })));
    percentageAlert.set(base, String(nextStyle++));
    const redFontId = withRedFonts.fontIds.get(attribute(xf, "fontId") ?? "0") ?? "0";
    additions.push(withCenterAlignment(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1", fontId: redFontId, applyFont: "1", fillId: "0", applyFill: "1" })));
    lateHandoverText.set(base, String(nextStyle++));
    additions.push(withXfAttributes(xf, { fillId: withLateHandoverFill.fillId, applyFill: "1", fontId: redFontId, applyFont: "1" }));
    availability.standard.set(base, String(nextStyle++));
    additions.push(withCenterAlignment(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1", fillId: "0", applyFill: "1" })));
    availability.downtime.set(base, String(nextStyle++));
    additions.push(withCenterAlignment(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1", fontId: redFontId, applyFont: "1", fillId: withAvailabilityFill.fillId, applyFill: "1" })));
    availability.closed.set(base, String(nextStyle++));
    const purpleFontId = withPurpleFonts.fontIds.get(attribute(xf, "fontId") ?? "0") ?? "0";
    additions.push(withCenterAlignment(withXfAttributes(xf, { numFmtId: "10", applyNumberFormat: "1", fontId: purpleFontId, applyFont: "1", fillId: "0", applyFill: "1" })));
  });
  const updatedOpen = /\bcount="\d+"/.test(container[1])
    ? container[1].replace(/\bcount="\d+"/, `count="${nextStyle}"`)
    : container[1].replace(">", ` count="${nextStyle}">`);
  return {
    stylesheetXml: withPurpleFonts.stylesheetXml.replace(container[0], `${updatedOpen}${container[2]}${additions.join("")}${container[3]}`),
    timeline,
    lateHandoverText,
    percentage,
    percentageAlert,
    availability,
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

function prepareTimelineUpdates(
  records: DowntimeRecord[],
  weatherIntervals: WeatherInterval[],
  maps: TemplateMaps,
  variants: StyleVariants,
  parkCloseTimes?: Record<string, string>
): Map<number, (rowXml: string) => string> {
  const byRow = new Map<number, DowntimeRecord[]>();
  for (const record of records.filter(item => item.status === "matched" && item.rideCode && (item.isClosed || (item.technicalStart !== undefined && item.technicalEnd !== undefined)))) {
    const key = `${timelineDateKey(record.dateKey)}|${record.rideCode}`;
    const row = maps.timelineRows.get(key);
    if (!row) continue;
    byRow.set(row, [...(byRow.get(row) ?? []), record]);
  }
  const weatherByRow = new Map<number, WeatherInterval[]>();
  for (const interval of weatherIntervals) {
    const row = maps.timelineRows.get(`${timelineDateKey(interval.dateKey)}|${interval.rideCode}`);
    if (row) weatherByRow.set(row, [...(weatherByRow.get(row) ?? []), interval]);
  }
  const allDayRows: number[] = [];
  for (const range of Array.from(maps.dayRows.values())) {
    for (let r = range.start; r <= range.end; r++) {
      allDayRows.push(r);
    }
  }
  const rowToRide = new Map<number, string>();
  for (const [key, row] of Array.from(maps.timelineRows.entries())) {
    const parts = key.split("|");
    if (parts.length >= 2) rowToRide.set(row, parts[1]);
  }
  const updates = new Map<number, (rowXml: string) => string>();
  for (const rowNumber of Array.from(new Set([...allDayRows, ...Array.from(byRow.keys()), ...Array.from(weatherByRow.keys())]))) {
    const rowRecords = byRow.get(rowNumber) ?? [];
    const rowWeather = weatherByRow.get(rowNumber) ?? [];
    updates.set(rowNumber, rowXml => {
      const cellStyles = new Map<string, { kind: TimelineStyleKind; priority: number }>();
      const descriptions: Array<{ reference: string; value: string; redSuffix?: string }> = [];
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
      for (const interval of rowWeather) {
        setRange(interval.startedAt, interval.resumedAt, "weather", 3);
        const labelColumn = Math.max(maps.timeStartColumn, maps.timeStartColumn + (interval.startedAt % 1440) - 605);
        descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: `Inclement Weather (${interval.condition})  `, redSuffix: "(Moderated)" });
      }
      for (const record of rowRecords) {
        if (record.isClosed) {
          setRange(600, 1079, "closed", 4);
          descriptions.push({ reference: `${numberToColumn(maps.timeStartColumn)}${rowNumber}`, value: `Closed — ${record.description}` });
          continue;
        }
        if (record.isFireAlarm) {
          setRange(record.technicalStart, record.technicalEnd, "fireAlarm", 4);
          const labelColumn = Math.max(maps.timeStartColumn, maps.timeStartColumn + (record.technicalStart! % 1440) - 605);
          descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: "Signal 29 (Fire Alarm Triggered)" });
          continue;
        }
        setRange(record.technicalStart, record.technicalEnd, record.isLateHandover ? "lateHandover" : "technical", 1);
        if (record.operationsEnd !== undefined && record.technicalEnd !== undefined && record.operationsEnd > record.technicalEnd) {
          setRange(record.technicalEnd + 1, record.operationsEnd, "operations", 2);
        }
        setRange(record.evacuationStart, record.evacuationEnd, "evacuation", 4);
        const labelColumn = Math.max(maps.timeStartColumn, maps.timeStartColumn + (record.technicalStart! % 1440) - 605);
        if (record.isLateHandover) {
          const faultMatch = /\s*(\([^)]*\))\s*$/.exec(record.description);
          descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: record.description.slice(0, faultMatch?.index).trimEnd() + (faultMatch ? " " : ""), redSuffix: faultMatch?.[1] ?? record.description });
        } else descriptions.push({ reference: `${numberToColumn(labelColumn)}${rowNumber}`, value: record.description });
      }
      const rideCode = rowToRide.get(rowNumber);
      const isRideClosed = rowRecords.some(r => r.isClosed) || (rideCode && parkCloseTimes?.[rideCode] === "CLOSED");
      if (!isRideClosed && rideCode) {
        const closeTime = parkCloseTimes?.[rideCode] ?? "18:00";
        if (closeTime && closeTime !== "CLOSED") {
          const [ch, cm] = closeTime.split(":").map(Number);
          if (Number.isFinite(ch) && Number.isFinite(cm)) {
            const closeMinute = ch * 60 + cm;
            const roundedMinute = Math.round(closeMinute / 5) * 5;
            const column = maps.timeStartColumn + roundedMinute - 600;
            const reference = `${numberToColumn(column)}${rowNumber}`;
            cellStyles.set(reference, { kind: "parkClose", priority: 5 });
          }
        }
      }
      let revised = rowXml;
      for (const description of descriptions) {
        revised = description.redSuffix
          ? setRichText(revised, description.reference, [{ value: description.value }, { value: description.redSuffix, color: "FFFF0000" }])
          : setText(revised, description.reference, description.value);
      }
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
  remarkParts: Array<{ value: string; color?: string }>;
};

function aggregateRecords(records: DowntimeRecord[]): Map<string, DailyAggregate> {
  const aggregates = new Map<string, DailyAggregate>();
  for (const record of records.filter(item => item.status === "matched" && item.rideCode && !item.isClosed && !item.isFireAlarm)) {
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
      remarkParts: [],
    };
    current.technicalMinutes += record.technicalMinutes;
    current.operationsMinutes += record.operationsMinutes;
    current.evacuationMinutes += record.evacuationMinutes;
    current.events += 1;
    if (record.evacuationEnd !== undefined) current.evacuationEvents += 1;
    const technicalRange = `${formatTime(record.technicalStart)}-${formatTime(record.technicalEnd)}`;
    const evacuationText = record.evacuationEnd === undefined ? "" : `, evac ${record.evacuationMinutes}mins (${formatTime(record.evacuationStart)}-${formatTime(record.evacuationEnd)})`;
    current.remarks.push(`*${record.dateLabel}, ${record.description}, ${record.technicalMinutes}mins (${technicalRange})${evacuationText}.`);
    if (current.remarks.length > 1) {
      current.remarkParts.push({ value: "\n" });
    }
    current.remarkParts.push({ value: `*${record.dateLabel}, ` });
    current.remarkParts.push({ value: record.description, color: "FFFF0000" });
    current.remarkParts.push({ value: `, ${record.technicalMinutes}mins (${technicalRange})` });
    if (record.evacuationEnd !== undefined) {
      current.remarkParts.push({ value: `, ` });
      current.remarkParts.push({ value: `evac ${record.evacuationMinutes}mins`, color: "FFFF0000" });
      current.remarkParts.push({ value: ` (${formatTime(record.evacuationStart)}-${formatTime(record.evacuationEnd)})` });
    }
    current.remarkParts.push({ value: "." });
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
      (xml: string) => aggregate.remarkParts && aggregate.remarkParts.length > 0
        ? setRichText(xml, `BC${row}`, aggregate.remarkParts)
        : setText(xml, `BC${row}`, aggregate.remarks.join("\n")),
    ];
    updates.set(row, [...(updates.get(row) ?? []), ...operations]);
  }
  return new Map(Array.from(updates.entries()).map(([row, operations]) => [row, (xml: string) => operations.reduce((output, operation) => operation(output), xml)]));
}

function prepareDailyPercentageUpdates(records: DowntimeRecord[], aggregates: Map<string, DailyAggregate>, maps: TemplateMaps, variants: StyleVariants): Map<number, (rowXml: string) => string> {
  const entries = new Map<number, DailyAggregate>();
  const closedRows = new Set<number>();
  for (const record of records.filter(item => item.status === "matched" && item.isClosed && item.rideCode)) {
    const row = maps.timelineRows.get(`${timelineDateKey(record.dateKey)}|${record.rideCode}`);
    if (row) closedRows.add(row);
  }
  for (const aggregate of Array.from(aggregates.values())) {
    const row = maps.timelineRows.get(`${timelineDateKey(aggregate.dateKey)}|${aggregate.rideCode}`);
    if (row) entries.set(row, aggregate);
  }
  const updates = new Map<number, (rowXml: string) => string>();
  for (const [dayKey, range] of Array.from(maps.dayRows.entries())) {
    for (let row = range.start; row <= range.end; row++) {
      updates.set(row, xml => {
        let revised = closedRows.has(row)
          ? setText(xml, `D${row}`, "CLOSED")
          : setNumber(xml, `D${row}`, 0);
        if (!closedRows.has(row)) {
          revised = setStyle(revised, `D${row}`, deriveStyle(findCell(revised, `D${row}`), variants.percentage));
        }
        if (row === range.start) revised = setNumber(revised, `E${row}`, 0);
        return revised;
      });
    }
  }
  for (const [row, aggregate] of Array.from(entries.entries())) {
    const previousUpdate = updates.get(row);
    updates.set(row, xml => {
      let revised = previousUpdate ? previousUpdate(xml) : xml;
      const percentageReference = `D${row}`;
      const fraction = aggregate.technicalMinutes / DAILY_OPERATING_MINUTES;
      revised = setFormula(revised, percentageReference, `${aggregate.technicalMinutes}/${DAILY_OPERATING_MINUTES}`, fraction);
      const percentageStyle = fraction >= 0.01 ? variants.percentageAlert : variants.percentage;
      revised = setStyle(revised, percentageReference, deriveStyle(findCell(revised, percentageReference), percentageStyle));
      return revised;
    });
  }
  for (const [dayKey, range] of Array.from(maps.dayRows.entries())) {
    const totalRow = range.start;
    const totalMinutes = records
      .filter(item => item.status === "matched" && !item.isClosed && !item.isFireAlarm && timelineDateKey(item.dateKey) === dayKey)
      .reduce((total, item) => total + item.technicalMinutes, 0);
    const totalFraction = totalMinutes / FLEET_OPERATING_MINUTES;
    const previousUpdate = updates.get(totalRow);
    updates.set(totalRow, xml => {
      let revised = previousUpdate ? previousUpdate(xml) : xml;
      const totalReference = `E${totalRow}`;
      revised = setFormula(revised, totalReference, `SUM(D${range.start}:D${range.end})/19`, totalFraction);
      const totalStyle = totalFraction >= 0.01 ? variants.percentageAlert : variants.percentage;
      revised = setStyle(revised, totalReference, deriveStyle(findCell(revised, totalReference), totalStyle));
      return revised;
    });
  }
  return updates;
}

function formatReportDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}\n${weekdays[date.getUTCDay()]}`;
}

function formatSheetName(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const end = new Date(date.getTime() + 6 * 86400000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}-${end.getUTCDate()} ${months[end.getUTCMonth()]} ${end.getUTCFullYear()}`.slice(0, 31);
}

function updateSheetName(workbookXml: string, previousName: string, nextName: string): string {
  const escapedPrevious = previousName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return workbookXml.replace(new RegExp(`(<sheet\\b[^>]*\\bname=")${escapedPrevious}("[^>]*>)`), `$1${escapeXml(nextName)}$2`);
}

function prepareReportDateUpdates(reportDateKey: string, maps: TemplateMaps): Map<number, (rowXml: string) => string> {
  const dayKey = timelineDateKey(reportDateKey);
  const range = dayKey ? maps.dayRows.get(dayKey) : undefined;
  return range ? new Map([[range.start, (xml: string) => setText(xml, `A${range.start}`, formatReportDate(reportDateKey))]]) : new Map();
}

const AVAILABILITY_COLUMNS = ["BZ", "CU", "DP", "EK", "FF", "GA", "GV"];
const AVAILABILITY_ROWS: Record<string, number> = {
  BWZ: 52, RTR: 55, ESD: 58, IDD: 61, NTM: 64, PTA: 67, "BCT (EV)": 70, "BCT (RC)": 73, "BCT (UZ)": 76, "BCT (ZC)": 79,
  AFP: 82, TTC: 85, MFZ: 92, ACR: 95, SRS: 98, ETI: 101, EHF: 104, VTM: 107, BSC: 110, RCC: 113, SAG: 116,
};
const TIMELINE_ROWS: Record<string, number> = { ACR: 4, BWZ: 5, BSC: 6, AFP: 7, ESD: 8, EHF: 9, VTM: 10, ETI: 11, IDD: 12, MFZ: 13, "BCT (EV)": 14, "BCT (RC)": 15, "BCT (UZ)": 16, "BCT (ZC)": 17, NTM: 18, PTA: 19, RCC: 20, RTR: 21, SAG: 22, SRS: 23, TTC: 24 };
const AVAILABILITY_AVERAGE_ROWS = [88, 119, 123];

function downtimeForRide(rideCode: string, aggregates: Map<string, DailyAggregate>, closedRides: Set<string>): number {
  return closedRides.has(rideCode) ? 0 : (aggregates.get(rideCode)?.technicalMinutes ?? 0) / DAILY_OPERATING_MINUTES;
}

function averageDowntime(aggregates: Map<string, DailyAggregate>, closedRides: Set<string>, start: number, end: number): number {
  const rides = Object.entries(AVAILABILITY_ROWS).filter(([, row]) => row >= start && row <= end).map(([ride]) => ride);
  return rides.reduce((sum, ride) => sum + downtimeForRide(ride, aggregates, closedRides), 0) / rides.length;
}

function prepareAvailabilityUpdates(records: DowntimeRecord[], aggregates: Map<string, DailyAggregate>, reportDateKey: string, variants: StyleVariants): Map<number, (rowXml: string) => string> {
  const aggregateByRide = new Map(Array.from(aggregates.values()).map(item => [item.rideCode, item]));
  const closedRides = new Set(records.filter(item => item.status === "matched" && item.isClosed && item.rideCode).map(item => item.rideCode!));
  const hasAfpRecord = records.some(record => record.status === "matched" && record.rideCode === "AFP");
  const updates = new Map<number, Array<(rowXml: string) => string>>();
  const add = (row: number, operation: (xml: string) => string) => updates.set(row, [...(updates.get(row) ?? []), operation]);
  AVAILABILITY_COLUMNS.forEach((column, index) => {
    if (index === 0) {
      add(48, xml => setNumber(xml, `${column}48`, Number(reportDateKey.slice(-2))));
      add(50, xml => setText(xml, `${column}50`, formatReportDate(reportDateKey).split("\n")[1]));
    } else {
      add(48, xml => clearCell(xml, `${column}48`));
      add(50, xml => clearCell(xml, `${column}50`));
    }
    Object.entries(AVAILABILITY_ROWS).forEach(([rideCode, row]) => {
      if (index > 0) add(row, xml => clearCell(xml, `${column}${row}`));
      else {
        const downtime = downtimeForRide(rideCode, aggregateByRide, closedRides);
        add(row, xml => {
          const reference = `${column}${row}`;
          let revised = closedRides.has(rideCode) ? setNumber(xml, reference, 0) : setFormula(xml, reference, `D${TIMELINE_ROWS[rideCode]}`, downtime);
          const kind = closedRides.has(rideCode) ? "closed" : downtime > 0 ? "downtime" : "standard";
          return setStyle(revised, reference, deriveStyle(findCell(revised, reference), variants.availability[kind]));
        });
      }
    });
    AVAILABILITY_AVERAGE_ROWS.forEach(row => { if (index > 0) add(row, xml => clearCell(xml, `${column}${row}`)); });
  });
  Object.entries(AVAILABILITY_ROWS).forEach(([rideCode, row]) => {
    add(row, xml => clearCell(xml, `HQ${row}`));
  });
  const zoneA = averageDowntime(aggregateByRide, closedRides, 52, 85);
  const zoneB = averageDowntime(aggregateByRide, closedRides, 92, 116);
  const total = averageDowntime(aggregateByRide, closedRides, 52, 116);
  const updateTotal = (reference: string, formula: string, value: number) => (xml: string) => {
    const revised = setFormula(xml, reference, formula, value);
    return setStyle(revised, reference, deriveStyle(findCell(revised, reference), value > 0 ? variants.percentageAlert : variants.percentage));
  };
  add(88, updateTotal("BZ88", "SUM(BZ52:CT87)/12", zoneA));
  add(119, updateTotal("BZ119", "SUM(BZ92:CT118)/9", zoneB));
  add(123, updateTotal("BZ123", "SUM(BZ52:CT87,BZ92:CT118)/19", total));
  add(88, xml => clearCell(xml, "HQ88"));
  add(119, xml => clearCell(xml, "HQ119"));
  add(123, xml => clearCell(xml, "HQ123"));
  return new Map(Array.from(updates.entries()).map(([row, operations]) => [row, (xml: string) => operations.reduce((result, operation) => operation(result), xml)]));
}

function normalizeManualRideCode(value: string): string | undefined {
  const normalized = normalizeText(value);
  if (normalized === "NATM") return "NTM";
  return TIMELINE_ROWS[value] ? value : ATTRACTION_CODES[normalized];
}

function manualClosureRecord(rideCode: string, reportDateKey: string): DowntimeRecord {
  return {
    sourceRow: 0,
    dateKey: reportDateKey,
    dateLabel: dateLabel(reportDateKey),
    attraction: rideCode,
    rideCode,
    department: "Handover selection",
    description: "Marked closed during handover review",
    technicalStart: 600,
    technicalEnd: 1080,
    operationsEnd: 1080,
    technicalMinutes: 480,
    operationsMinutes: 0,
    evacuationMinutes: 0,
    downtimePercentage: 0,
    isClosed: true,
    isFireAlarm: false,
    isLateHandover: false,
    status: "unmatched",
    matchNote: "Awaiting template match",
  };
}

export async function processDowntimeWorkbooks(operationsBuffer: Buffer, templateBuffer: Buffer, options: ProcessingOptions = {}): Promise<ProcessingResult> {
  const [operationsZip, templateZip] = await Promise.all([JSZip.loadAsync(operationsBuffer), JSZip.loadAsync(templateBuffer)]);
  const [operationWorkbook, templateWorkbook] = await Promise.all([getSheets(operationsZip), getSheets(templateZip)]);
  const operationsSheet = operationWorkbook.sheets[0];
  if (!operationsSheet) throw new Error("The Operations workbook does not contain a downtime worksheet.");
  const records = parseOperations(operationsSheet, operationWorkbook.sharedStrings);
  if (records.length === 0) throw new Error("No downtime records with the 11-1 code were found in the Operations workbook.");
  const outputDate = records.find(record => record.dateKey)?.dateKey;
  if (!outputDate) throw new Error("The Operations log does not include a usable report date.");
  const existingClosures = new Set(records.filter(record => record.isClosed && record.rideCode).map(record => record.rideCode!));
  const manualRideCodes = Array.from(new Set((options.manualClosedRideCodes ?? []).map(normalizeManualRideCode).filter((rideCode): rideCode is string => Boolean(rideCode))));
  manualRideCodes.filter(rideCode => !existingClosures.has(rideCode)).forEach(rideCode => records.push(manualClosureRecord(rideCode, outputDate)));
  const workbookWeatherIntervals = parseWorkbookWeatherIntervals(operationsSheet, operationWorkbook.sharedStrings, outputDate);
  const manualWeatherIntervals = parseWeatherIntervals(options.weatherText ?? "", outputDate);
  const weatherIntervals = [...workbookWeatherIntervals, ...manualWeatherIntervals];
  const combinedWeatherText = options.weatherText?.trim() || formatWeatherIntervalsToText(workbookWeatherIntervals);
  const maps = buildTemplateMaps(templateWorkbook.sheets, templateWorkbook.sharedStrings, outputDate);
  const styleVariants = createStyleVariants(await textFromZip(templateZip, "xl/styles.xml"));
  templateZip.file("xl/styles.xml", styleVariants.stylesheetXml);
  for (const record of records) {
    if (!record.dateKey) record.matchNote = "The source row does not include a usable date.";
    else if (!record.rideCode) record.matchNote = "The attraction is not mapped to a Technical template ride code.";
    else if (record.isFireAlarm && !maps.timelineRows.has(`${timelineDateKey(record.dateKey)}|${record.rideCode}`)) record.matchNote = "No matching date and ride row exists in the supplied Technical template.";
    else if (record.isFireAlarm && (record.technicalStart === undefined || record.technicalEnd === undefined)) record.matchNote = "A fire-alarm start or end time is missing.";
    else if (record.isFireAlarm) {
      record.status = "matched";
      record.matchNote = "Signal 29 is mapped visually in green and excluded from downtime percentages.";
    }
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
  const timelineUpdates = prepareTimelineUpdates(records, weatherIntervals, maps, styleVariants, options.parkCloseTimes);
  const dailyPercentageUpdates = prepareDailyPercentageUpdates(records, aggregates, maps, styleVariants);
  const reportDateUpdates = prepareReportDateUpdates(outputDate, maps);
  const availabilityUpdates = prepareAvailabilityUpdates(records, aggregates, outputDate, styleVariants);
  for (const [row, update] of Array.from(dailyPercentageUpdates.entries())) {
    const previousUpdate = timelineUpdates.get(row);
    timelineUpdates.set(row, (xml: string) => update(previousUpdate ? previousUpdate(xml) : xml));
  }
  for (const [row, update] of Array.from(reportDateUpdates.entries())) {
    const previousUpdate = timelineUpdates.get(row);
    timelineUpdates.set(row, (xml: string) => update(previousUpdate ? previousUpdate(xml) : xml));
  }
  for (const [row, update] of Array.from(availabilityUpdates.entries())) {
    const previousUpdate = timelineUpdates.get(row);
    timelineUpdates.set(row, (xml: string) => update(previousUpdate ? previousUpdate(xml) : xml));
  }
  const timelineXml = changeRows(
    maps.timelineSheet.xml,
    timelineUpdates
  );
  templateZip.file(maps.timelineSheet.path, timelineXml);
  templateZip.file("xl/workbook.xml", updateSheetName(await textFromZip(templateZip, "xl/workbook.xml"), maps.timelineSheet.name, formatSheetName(outputDate)));
  if (maps.summarySheet) {
    const summaryXml = changeRows(maps.summarySheet.xml, prepareSummaryUpdates(aggregates, maps));
    templateZip.file(maps.summarySheet.path, summaryXml);
  }
  const summaryByRide = Array.from(
    records.filter(record => record.status === "matched" && record.rideCode && !record.isFireAlarm)
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
  return {
    records,
    matchedCount: records.filter(record => record.status === "matched" && !record.isClosed && !record.isFireAlarm).length,
    unmatchedCount: records.filter(record => record.status === "unmatched").length,
    totalTechnicalMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed && !record.isFireAlarm ? record.technicalMinutes : 0), 0),
    totalOperationsMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed && !record.isFireAlarm ? record.operationsMinutes : 0), 0),
    totalEvacuationMinutes: records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed && !record.isFireAlarm ? record.evacuationMinutes : 0), 0),
    totalEvacuationEvents: records.filter(record => record.status === "matched" && !record.isClosed && !record.isFireAlarm && record.evacuationEnd !== undefined).length,
    totalNetworkPercentage: (records.reduce((total, record) => total + (record.status === "matched" && !record.isClosed && !record.isFireAlarm ? record.technicalMinutes : 0), 0) / FLEET_OPERATING_MINUTES) * 100,
    closedRideCount: records.filter(record => record.status === "matched" && record.isClosed).length,
    weatherIntervalCount: weatherIntervals.length,
    fireAlarmCount: records.filter(record => record.status === "matched" && record.isFireAlarm).length,
    summaryByRide: [...summaryByRide].sort((a, b) => b.minutes - a.minutes),
    outputBuffer,
    outputFileName: `Technical_Downtime_${outputDate}.xlsx`,
    outputDate,
    weatherText: combinedWeatherText,
  };
}

export const __testables = { parseSharedStrings, parseRows, timelineDateKey, excelDateToKey, buildTemplateMaps, getSheets };
