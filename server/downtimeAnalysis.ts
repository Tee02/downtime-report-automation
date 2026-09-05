import { type SavedDowntimeReport } from "../drizzle/schema";
import { compileDowntimeLogExport, type DowntimeRecord, readTechnicalDowntimeRecords } from "./downtimeProcessor";
import { storageGetSignedUrl, storagePut } from "./storage";

const FLEET_RIDE_COUNT = 19;
const DAILY_OPERATING_MINUTES = 480;
const FLEET_RIDES = [
  ["ACR", "Acorn Adventure"], ["BWZ", "Big Weld's Zeppelin"], ["BSC", "Blue Sky Carousel"], ["AFP", "Alpha Fighter Pilots"], ["ESD", "ESD: Global Defender"], ["EHF", "Epic Hummingbird Flyers"],
  ["VTM", "Epic Voyage to Moonhaven"], ["ETI", "Expedition Thin Ice"], ["IDD", "Independence Day: Defiance"], ["MFZ", "Mammoth Fun Zone"], ["BCT (EV)", "Boot Camp: Extreme Vert"],
  ["BCT (RC)", "Boot Camp: Ropes Course"], ["BCT (UZ)", "Boot Camp: Unharnessed Zones"], ["BCT (ZC)", "Boot Camp: Zip Coaster"], ["NTM", "Night At The Museum"], ["PTA", "Invasion of the Planet of the Apes"],
  ["RCC", "Rio Carnaval Chaos"], ["RTR", "Rivet Town Roller"], ["SAG", "Samba Gliders"], ["SRS", "Sid's Rock 'N' Slide"], ["TTC", "Terraform Tower Challenge"],
] as const;

type LoadedReport = {
  report: SavedDowntimeReport;
  buffer: Buffer;
  records: DowntimeRecord[];
};

export type RideAnalysis = {
  rideCode: string;
  attraction: string;
  minutes: number;
  events: number;
  downtimePercentage: number;
  availabilityPercentage: number;
  evacuationMinutes: number;
  evacuationEvents: number;
};

export type AnalysisResult = {
  totalTechnicalMinutes: number;
  totalEvents: number;
  totalEvacuationMinutes: number;
  totalEvacuationEvents: number;
  averageEventsPerDay: number;
  averageDowntimePercentage: number;
  averageIncidentMinutes: number;
  affectedRideCount: number;
  selectedDayCount: number;
  selectedRideCount: number;
  topRides: RideAnalysis[];
  dailyTrend: Array<{ dateKey: string; label: string; minutes: number; events: number; percentage: number; evacuationMinutes: number; evacuationEvents: number }>;
  weekdayPattern: Array<{ weekday: string; minutes: number; events: number; days: number; averageMinutes: number }>;
  peakDay?: { dateKey: string; label: string; minutes: number };
  longestIncident?: { rideCode: string; attraction: string; minutes: number; dateKey: string };
};

function labelDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function weekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function keyFromStorageUrl(url: string) {
  const prefix = "/manus-storage/";
  if (!url.startsWith(prefix)) throw new Error("A saved source log has an invalid storage reference.");
  return url.slice(prefix.length);
}

export async function loadSavedDowntimeReports(reports: SavedDowntimeReport[]): Promise<LoadedReport[]> {
  const loaded: LoadedReport[] = [];
  for (const report of reports) {
    const signedUrl = await storageGetSignedUrl(keyFromStorageUrl(report.sourceFileUrl));
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`The saved source log for ${report.reportDate} could not be retrieved.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    loaded.push({ report, buffer, records: await readTechnicalDowntimeRecords(buffer) });
  }
  return loaded;
}

export function buildAnalysis(reports: Array<{ reportDate: string; records: DowntimeRecord[] }>, selectedRideCodes: string[]): AnalysisResult {
  const selectedCodes = new Set(selectedRideCodes);
  const selectedDates = Array.from(new Set(reports.map(report => report.reportDate))).sort();
  const sourceRecords = reports.flatMap(report => report.records.map(record => ({ ...record, dateKey: record.dateKey || report.reportDate })));
  const records = sourceRecords.filter(record => record.rideCode && !record.isClosed && !record.isFireAlarm && (selectedCodes.size === 0 || selectedCodes.has(record.rideCode)));
  const operatingRideCount = selectedCodes.size || FLEET_RIDE_COUNT;
  const dailyTrend = selectedDates.map(dateKey => {
    const dailyRecords = records.filter(record => record.dateKey === dateKey);
    const minutes = dailyRecords.reduce((total, record) => total + record.technicalMinutes, 0);
    const evacuationMinutes = dailyRecords.reduce((total, record) => total + record.evacuationMinutes, 0);
    const evacuationEvents = dailyRecords.filter(record => record.evacuationEnd !== undefined).length;
    return { dateKey, label: labelDate(dateKey), minutes, events: dailyRecords.length, percentage: (minutes / (DAILY_OPERATING_MINUTES * operatingRideCount)) * 100, evacuationMinutes, evacuationEvents };
  });
  const rideTotals = new Map<string, RideAnalysis>();
  const rideNames = new Map<string, string>(FLEET_RIDES.map(([rideCode, attraction]) => [rideCode, attraction]));
  for (const record of records) {
    const current = rideTotals.get(record.rideCode!) ?? { rideCode: record.rideCode!, attraction: record.attraction, minutes: 0, events: 0, downtimePercentage: 0, availabilityPercentage: 100, evacuationMinutes: 0, evacuationEvents: 0 };
    current.minutes += record.technicalMinutes;
    current.events += 1;
    current.evacuationMinutes += record.evacuationMinutes;
    if (record.evacuationEnd !== undefined) current.evacuationEvents += 1;
    rideTotals.set(record.rideCode!, current);
  }
  const rankingCodes = selectedCodes.size ? Array.from(selectedCodes) : FLEET_RIDES.map(([rideCode]) => rideCode);
  const topRides = rankingCodes.map(rideCode => {
    const ride = rideTotals.get(rideCode) ?? { rideCode, attraction: rideNames.get(rideCode) ?? rideCode, minutes: 0, events: 0, downtimePercentage: 0, availabilityPercentage: 100, evacuationMinutes: 0, evacuationEvents: 0 };
    const downtimePercentage = (ride.minutes / Math.max(1, selectedDates.length * DAILY_OPERATING_MINUTES)) * 100;
    return { ...ride, downtimePercentage, availabilityPercentage: Math.max(0, 100 - downtimePercentage) };
  }).sort((left, right) => left.availabilityPercentage - right.availabilityPercentage || right.minutes - left.minutes || right.events - left.events);
  const weekdayTotals = new Map<string, { weekday: string; minutes: number; events: number; days: number }>();
  for (const day of dailyTrend) {
    const name = weekday(day.dateKey);
    const current = weekdayTotals.get(name) ?? { weekday: name, minutes: 0, events: 0, days: 0 };
    current.minutes += day.minutes;
    current.events += day.events;
    current.days += 1;
    weekdayTotals.set(name, current);
  }
  const weekdayPattern = Array.from(weekdayTotals.values()).map(day => ({ ...day, averageMinutes: day.minutes / day.days })).sort((left, right) => right.minutes - left.minutes);
  const totalTechnicalMinutes = records.reduce((total, record) => total + record.technicalMinutes, 0);
  const totalEvacuationMinutes = records.reduce((total, record) => total + record.evacuationMinutes, 0);
  const totalEvacuationEvents = records.filter(record => record.evacuationEnd !== undefined).length;
  const peak = [...dailyTrend].sort((left, right) => right.minutes - left.minutes)[0];
  const longest = [...records].sort((left, right) => right.technicalMinutes - left.technicalMinutes)[0];
  return {
    totalTechnicalMinutes,
    totalEvents: records.length,
    totalEvacuationMinutes,
    totalEvacuationEvents,
    averageEventsPerDay: records.length / Math.max(1, selectedDates.length),
    averageDowntimePercentage: dailyTrend.reduce((total, day) => total + day.percentage, 0) / Math.max(1, selectedDates.length),
    averageIncidentMinutes: totalTechnicalMinutes / Math.max(1, records.length),
    affectedRideCount: rideTotals.size,
    selectedDayCount: selectedDates.length,
    selectedRideCount: operatingRideCount,
    topRides,
    dailyTrend,
    weekdayPattern,
    peakDay: peak ? { dateKey: peak.dateKey, label: peak.label, minutes: peak.minutes } : undefined,
    longestIncident: longest ? { rideCode: longest.rideCode!, attraction: longest.attraction, minutes: longest.technicalMinutes, dateKey: longest.dateKey } : undefined,
  };
}

export async function exportCompiledDowntimeLog(reports: SavedDowntimeReport[], selectedRideCodes: string[]) {
  const loaded = await loadSavedDowntimeReports(reports);
  const outputBuffer = await compileDowntimeLogExport(loaded.map(item => ({ reportDate: item.report.reportDate, buffer: item.buffer })), selectedRideCodes);
  const dateSuffix = Array.from(new Set(reports.map(report => report.reportDate))).sort().join("_");
  const outputFileName = `Compiled_Downtime_Log_${dateSuffix}.xlsx`;
  const stored = await storagePut(`analysis-exports/${crypto.randomUUID()}/${outputFileName}`, outputBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return { outputFileName, downloadUrl: stored.url };
}
