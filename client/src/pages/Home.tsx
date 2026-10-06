import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EditableText } from "@/contexts/TextEditContext";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleOff,
  CloudSun,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Info,
  ListOrdered,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type SourceMode = "upload" | "saved";
type MappingStatus = "idle" | "processing" | "success" | "error";
type WorkbookTab = "sheet" | "summary" | "chart";

type ReviewRecord = {
  sourceRow: number;
  dateKey: string;
  dateLabel: string;
  attraction: string;
  rideCode?: string;
  department: string;
  description: string;
  technicalMinutes: number;
  operationsMinutes: number;
  evacuationMinutes: number;
  downtimePercentage: number;
  isClosed: boolean;
  isFireAlarm: boolean;
  status: "matched" | "unmatched";
  matchNote: string;
};

type SummaryRide = {
  rideCode: string;
  attraction: string;
  minutes: number;
  events: number;
  evacuationMinutes: number;
  percentage: number;
  isClosed: boolean;
};

type DailySummary = {
  dateKey: string;
  technicalMinutes: number;
  incidents: number;
  downtimePercentage: number;
};

type SourceFile = {
  id?: number;
  reportDate?: string;
  fileName: string;
  url?: string;
};

type ProcessingResponse = {
  records: ReviewRecord[];
  matchedCount: number;
  unmatchedCount: number;
  totalTechnicalMinutes: number;
  totalOperationsMinutes: number;
  totalEvacuationMinutes: number;
  totalEvacuationEvents: number;
  totalNetworkPercentage: number;
  closedRideCount: number;
  weatherIntervalCount?: number;
  fireAlarmCount?: number;
  summaryByRide: SummaryRide[];
  dailySummary?: DailySummary[];
  outputDate?: string;
  outputFileName: string;
  downloadUrl: string;
  sourceDates?: string[];
  sourceFiles?: SourceFile[];
  savedToLibrary?: boolean;
  parkCloseMappedCount?: number;
};

type SavedReport = {
  id: number;
  reportDate: string;
  sourceFileName: string;
  sourceFileUrl: string;
  outputFileName: string;
  outputFileUrl: string;
  totalTechnicalMinutes: number;
  totalNetworkPercentage: number;
  weatherIntervalCount: number;
  weatherText: string | null;
  createdAt: Date | string;
};

const HANDOVER_RIDES = [
  ["ACR", "Acorn Adventure"], ["BWZ", "Big Weld's Zeppelin"], ["BSC", "Blue Sky Carousel"], ["AFP", "Alpha Fighter Pilots"], ["ESD", "ESD: Global Defender"], ["EHF", "Epic Hummingbird Flyers"],
  ["VTM", "Epic Voyage to Moonhaven"], ["ETI", "Expedition Thin Ice"], ["IDD", "Independence Day: Defiance"], ["MFZ", "Mammoth Fun Zone"], ["BCT (EV)", "Boot Camp: Extreme Vert"],
  ["BCT (RC)", "Boot Camp: Ropes Course"], ["BCT (UZ)", "Boot Camp: Unharnessed Zones"], ["BCT (ZC)", "Boot Camp: Zip Coaster"], ["NTM", "Night At The Museum"], ["PTA", "Invasion of the Planet of the Apes"],
  ["RCC", "Rio Carnaval Chaos"], ["RTR", "Rivet Town Roller"], ["SAG", "Samba Gliders"], ["SRS", "Sid's Rock 'N' Slide"], ["TTC", "Terraform Tower Challenge"],
] as const;

const BASE_MAPPING_STEPS = [
  ["Source log validated", "Operations log uploaded and validated."],
  ["Technical 11-1 rows selected", "Extracted and validated relevant Technical downtime rows."],
  ["Non-fire 11-10 alarms excluded", "Verified Signal 29 fire alarms separated from non-fire records."],
  ["AVL downtime excluded", "AVL downtime excluded from timeline calculations."],
  ["Weather 11-3 mapped", "Applying automated and manual weather intervals in yellow fill."],
  ["11-27 vehicle evacuation resolved", "Inheriting downtime start timing for vehicle evacuations."],
  ["10-7 Park Close mapped", "Mapping ride-by-ride park closure times in red."],
  ["Handover closures applied", "Applying confirmed late and no technical handover formatting."],
  ["Downtime percentages centered", "Writing centered downtime percentages across Columns D & E."],
  ["Mapping Excel generated", "Mapping workbook successfully finalized and ready for download."],
] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value: string, includeYear = true) {
  return dateFromKey(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function formatDateRange(values: string[]) {
  if (!values.length) return "";
  if (values.length === 1) return formatDate(values[0]!);
  return `${formatDate(values[0]!, false)}–${formatDate(values.at(-1)!)}`;
}

function reportDateFromFileName(fileName?: string) {
  if (!fileName) return undefined;
  const dayFirst = /(?:^|\D)(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})(?:\D|$)/.exec(fileName);
  const yearFirst = /(?:^|\D)(\d{4})[.\-_](\d{1,2})[.\-_](\d{1,2})(?:\D|$)/.exec(fileName);
  const value = dayFirst
    ? `${dayFirst[3]}-${dayFirst[2]!.padStart(2, "0")}-${dayFirst[1]!.padStart(2, "0")}`
    : yearFirst
      ? `${yearFirst[1]}-${yearFirst[2]!.padStart(2, "0")}-${yearFirst[3]!.padStart(2, "0")}`
      : undefined;
  if (!value || Number.isNaN(dateFromKey(value).getTime())) return undefined;
  return value;
}

function severityForMinutes(minutes: number) {
  if (minutes >= 120) return { label: "Critical", color: "#D84A5D" };
  if (minutes >= 60) return { label: "High", color: "#E67E36" };
  if (minutes >= 30) return { label: "Elevated", color: "#3D52A0" };
  return { label: "Monitor", color: "#7091E6" };
}

function FileDropzone({
  label,
  note,
  required,
  file,
  onFile,
  onClear,
  acceptExt,
  badgeLabel,
  icon: Icon,
}: {
  label: string;
  note: string;
  required: boolean;
  file?: File;
  onFile: (file: File) => void;
  onClear: () => void;
  acceptExt: string;
  badgeLabel: string;
  icon: typeof FileSpreadsheet;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = (candidate?: File) => {
    if (!candidate) return;
    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (badgeLabel === "PDF" && extension !== "pdf") {
      toast.error("Please choose a PDF Park Close log.");
      return;
    }
    if (badgeLabel === "XLSX" && extension !== "xlsx") {
      toast.error("Please choose an XLSX downtime log.");
      return;
    }
    onFile(candidate);
  };

  if (file) {
    return (
      <div className="relative min-h-40 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-[0_8px_24px_rgba(5,150,105,0.08)]">
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onClear}
          className="absolute right-3 top-3 z-10 rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-all duration-150 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-2 pr-9 text-sm font-extrabold text-slate-900">
          <Icon className="h-4 w-4 text-emerald-700" />
          <span>{label}</span>
          <Badge className={required ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}>
            {required ? "Required" : "Optional"}
          </Badge>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-white p-4">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{file.name}</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">{required ? "Ready to map" : "Loaded"}</p>
            <p className="mt-1 text-[11px] text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Choose ${label}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={event => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        accept(event.dataTransfer.files?.[0]);
      }}
      className="group min-h-40 w-full rounded-2xl border border-dashed border-slate-300 bg-white/75 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500 hover:bg-sky-50/70 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
    >
      <input
        ref={inputRef}
        aria-label={label}
        className="sr-only"
        type="file"
        accept={acceptExt}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          accept(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-slate-950 p-2.5 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
          <Icon className="h-5 w-5" />
        </span>
        <Badge variant="outline" className={required ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-700"}>
          {required ? "Required" : "Optional"}
        </Badge>
      </div>
      <p className="mt-5 text-sm font-extrabold tracking-tight text-slate-900">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-700">
        <UploadCloud className="h-3.5 w-3.5" /> Drag and drop or click to select {badgeLabel}
      </span>
    </div>
  );
}

function WorkflowStepper({ status, sourceReady }: { status: MappingStatus; sourceReady: boolean }) {
  const buildActive = status === "processing";
  const complete = status === "success";
  const sourceComplete = status !== "idle" || sourceReady;
  const contextComplete = status !== "idle";
  const steps = [
    { number: 1, label: "Choose source", complete: sourceComplete },
    { number: 2, label: "Additional context", complete: contextComplete },
    { number: 3, label: "Build mapping Excel", complete },
  ];

  return (
    <ol className="grid min-w-0 grid-cols-3 rounded-2xl border border-white/60 bg-white/75 p-3 shadow-sm backdrop-blur lg:min-w-[500px]" aria-label="Mapping workflow progress">
      {steps.map((step, index) => {
        const active = status === "idle" ? index === (sourceReady ? 1 : 0) : buildActive && index === 2;
        return (
          <li key={step.number} className="relative flex min-w-0 items-center gap-2 px-2">
            {index > 0 && <span className="absolute -left-2 top-1/2 h-px w-4 bg-slate-200" />}
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${
              step.complete ? "border-emerald-700 bg-emerald-700 text-white" : active ? "border-emerald-600 bg-white text-emerald-700" : "border-slate-300 bg-white text-slate-500"
            }`}>
              {step.complete ? <Check className="h-4 w-4" /> : active && index === 2 ? <Loader2 className="h-4 w-4 animate-spin" /> : step.number}
            </span>
            <span className={`text-[11px] font-bold leading-4 ${step.complete || active ? "text-slate-900" : "text-slate-500"}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusRow({ tone = "complete", title, detail }: { tone?: "complete" | "optional" | "pending"; title: string; detail?: string }) {
  return (
    <div className="flex gap-3 py-3">
      {tone === "complete" ? (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"><Check className="h-3.5 w-3.5" /></span>
      ) : tone === "optional" ? (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700"><Info className="h-3.5 w-3.5" /></span>
      ) : (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400"><Circle className="h-3 w-3" /></span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        {detail && <p className="mt-0.5 break-words text-[11px] leading-4 text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

function MappingTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailySummary }> }) {
  if (!active || !payload?.[0]?.payload) return null;
  const day = payload[0].payload;
  const severity = severityForMinutes(day.technicalMinutes);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-xl">
      <p className="font-extrabold text-slate-900">{formatDate(day.dateKey)}</p>
      <p className="mt-1">{day.technicalMinutes} min technical downtime</p>
      <p className="mt-1 font-bold" style={{ color: severity.color }}>{severity.label}</p>
    </div>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: savedReportsData = [], isLoading: savedReportsLoading, error: savedReportsError } = trpc.savedReports.list.useQuery();
  const { data: darkDays = [] } = trpc.darkDays.list.useQuery();
  const savedReports = savedReportsData as SavedReport[];
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [operationsFile, setOperationsFile] = useState<File>();
  const [parkCloseFile, setParkCloseFile] = useState<File>();
  const [selectedSavedIds, setSelectedSavedIds] = useState<Set<number>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState<Date>();
  const [duplicateDate, setDuplicateDate] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [handoverEnabled, setHandoverEnabled] = useState(false);
  const [handoverClosedRides, setHandoverClosedRides] = useState<string[]>([]);
  const [closureToAdd, setClosureToAdd] = useState<string>();
  const [weatherText, setWeatherText] = useState("");
  const [mappingStatus, setMappingStatus] = useState<MappingStatus>("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [response, setResponse] = useState<ProcessingResponse>();
  const [error, setError] = useState<string>();
  const [workbookTab, setWorkbookTab] = useState<WorkbookTab>("sheet");
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const reportsByDate = useMemo(() => {
    const grouped = new Map<string, SavedReport[]>();
    savedReports.forEach(report => grouped.set(report.reportDate, [...(grouped.get(report.reportDate) ?? []), report]));
    return grouped;
  }, [savedReports]);

  const availableDateKeys = useMemo(() => Array.from(reportsByDate.keys()).sort(), [reportsByDate]);
  useEffect(() => {
    if (!calendarMonth && availableDateKeys.length) setCalendarMonth(dateFromKey(availableDateKeys.at(-1)!));
  }, [availableDateKeys, calendarMonth]);

  const orderedSelectedReports = useMemo(
    () => savedReports.filter(report => selectedSavedIds.has(report.id)).sort((left, right) => left.reportDate.localeCompare(right.reportDate)),
    [savedReports, selectedSavedIds],
  );
  const orderedDates = useMemo(() => orderedSelectedReports.map(report => report.reportDate), [orderedSelectedReports]);
  const validSource = sourceMode === "upload" ? Boolean(operationsFile) : orderedSelectedReports.length > 0;

  const selectedDateObjects = useMemo(() => orderedDates.map(dateFromKey), [orderedDates]);
  const calendarModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = {
      savedLog: availableDateKeys.map(dateFromKey),
      mappingSelected: selectedDateObjects,
      darkDay: darkDays.map(dateFromKey),
    };
    orderedDates.forEach((value, index) => {
      modifiers[`mappingOrder${index + 1}`] = [dateFromKey(value)];
    });
    return modifiers;
  }, [availableDateKeys, orderedDates, selectedDateObjects]);

  const resultDates = useMemo(() => {
    if (response?.sourceDates?.length) return [...response.sourceDates].sort();
    const fromRecords = Array.from(new Set((response?.records ?? []).map(record => record.dateKey).filter(Boolean))).sort();
    if (fromRecords.length) return fromRecords;
    return response?.outputDate ? [response.outputDate] : [];
  }, [response]);

  const dailySummary = useMemo<DailySummary[]>(() => {
    if (response?.dailySummary?.length) return [...response.dailySummary].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
    return resultDates.map(value => {
      const records = (response?.records ?? []).filter(record => record.dateKey === value && record.status === "matched" && !record.isClosed && !record.isFireAlarm);
      const technicalMinutes = records.reduce((sum, record) => sum + record.technicalMinutes, 0);
      return { dateKey: value, technicalMinutes, incidents: records.length, downtimePercentage: technicalMinutes / (480 * 19) * 100 };
    });
  }, [response, resultDates]);

  const previewRows = useMemo(
    () => (response?.records ?? []).filter(record => record.status === "matched" && !record.isClosed && !record.isFireAlarm).slice(0, 12),
    [response],
  );

  const resetResult = () => {
    setMappingStatus("idle");
    setProgressPercent(0);
    setCurrentStepIndex(0);
    setResponse(undefined);
    setError(undefined);
    setWorkbookTab("sheet");
  };

  const changeSourceMode = (mode: SourceMode) => {
    if (mappingStatus === "processing") return;
    setSourceMode(mode);
    resetResult();
  };

  const toggleSavedReport = (report: SavedReport) => {
    if (mappingStatus === "processing") return;
    setSelectedSavedIds(current => {
      const next = new Set(current);
      const sameDateIds = reportsByDate.get(report.reportDate)?.map(item => item.id) ?? [];
      sameDateIds.forEach(id => next.delete(id));
      if (!current.has(report.id)) next.add(report.id);
      return next;
    });
    setDuplicateDate(undefined);
    setResponse(undefined);
    setError(undefined);
  };

  const handleSavedDateClick = (day: Date) => {
    const key = dateKey(day);
    const dateReports = reportsByDate.get(key) ?? [];
    if (!dateReports.length) return;
    if (dateReports.length > 1) {
      setDuplicateDate(key);
      return;
    }
    toggleSavedReport(dateReports[0]!);
  };

  const addHandoverClosure = () => {
    if (!closureToAdd) return;
    setHandoverClosedRides(current => current.includes(closureToAdd) ? current : [...current, closureToAdd]);
    setClosureToAdd(undefined);
    setResponse(undefined);
  };

  // Dynamic steps calculation
  const totalMappingSteps = useMemo<number>(() => {
    let count: number = BASE_MAPPING_STEPS.length;
    if (sourceMode === "saved") {
      count = Math.max(10, orderedSelectedReports.length * 6 + 4);
    } else if (parkCloseFile) {
      count += 2;
    }
    return count;
  }, [sourceMode, orderedSelectedReports.length, parkCloseFile]);

  const buildMappingExcel = async () => {
    if (!validSource || mappingStatus === "processing") return;
    setMappingStatus("processing");
    setProgressPercent(8);
    setCurrentStepIndex(1);
    setResponse(undefined);
    setError(undefined);
    setWorkbookTab("sheet");

    // Smooth progress simulation while request is in-flight
    let progressValue = 8;
    const progressInterval = window.setInterval(() => {
      progressValue += Math.max(1, Math.floor((92 - progressValue) * 0.15));
      if (progressValue > 90) progressValue = 90;
      setProgressPercent(progressValue);
      setCurrentStepIndex(Math.min(totalMappingSteps - 1, Math.floor((progressValue / 100) * totalMappingSteps)));
    }, 180);

    try {
      let result: Response;
      if (sourceMode === "upload") {
        const formData = new FormData();
        formData.append("operationsFile", operationsFile!);
        formData.append("closedRideCodes", JSON.stringify(handoverEnabled ? handoverClosedRides : []));
        // Requirement: Always save uploaded downtime logs automatically to website system
        formData.append("saveToStorage", "true");
        if (weatherText.trim()) formData.append("weatherText", weatherText.trim());
        if (parkCloseFile) formData.append("parkCloseFile", parkCloseFile);
        result = await fetch("/api/downtime/analyze", { method: "POST", body: formData });
      } else {
        result = await fetch("/api/downtime/map-saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportIds: orderedSelectedReports.map(report => report.id),
            closedRideCodes: handoverEnabled ? handoverClosedRides : [],
            weatherText: orderedSelectedReports.length === 1 ? weatherText.trim() || undefined : undefined,
          }),
        });
      }
      const payload = await result.json() as ProcessingResponse & { error?: string; savedToLibrary?: boolean; replacedExisting?: boolean };
      if (!result.ok) throw new Error(payload.error ?? "The Mapping Excel could not be generated.");

      // Complete smoothly to 100%
      window.clearInterval(progressInterval);
      setProgressPercent(100);
      setCurrentStepIndex(totalMappingSteps);
      setResponse(payload);
      setMappingStatus("success");

      // Invalidate saved reports so calendar immediately shows the newly saved log
      await utils.savedReports.list.invalidate();

      if (sourceMode === "upload") {
        if (payload.replacedExisting) {
          toast.success("Mapping Excel generated. The previous saved downtime log for this date was replaced.");
        } else if (payload.savedToLibrary) {
          toast.success("Mapping Excel generated and source log saved to website.");
        } else {
          toast.success("Mapping Excel generated successfully.");
        }
      } else {
        toast.success("Mapping Excel generated successfully.");
      }
    } catch (caught) {
      window.clearInterval(progressInterval);
      const message = caught instanceof Error ? caught.message : "The Mapping Excel could not be generated.";
      setError(message);
      setMappingStatus("error");
      toast.error(message);
    }
  };

  const openSourceFiles = () => setSourcesOpen(true);

  const sourceFilesForDialog = useMemo<SourceFile[]>(() => {
    if (response?.sourceFiles?.length) return response.sourceFiles;
    if (sourceMode === "saved") return orderedSelectedReports.map(report => ({ id: report.id, reportDate: report.reportDate, fileName: report.sourceFileName, url: report.sourceFileUrl }));
    return [
      ...(operationsFile ? [{ fileName: operationsFile.name }] : []),
      ...(parkCloseFile ? [{ fileName: parkCloseFile.name }] : []),
    ];
  }, [response, sourceMode, orderedSelectedReports, operationsFile, parkCloseFile]);

  const openSource = (source: SourceFile) => {
    if (source.url) {
      window.open(source.url, "_blank", "noopener,noreferrer");
      return;
    }
    const localFile = source.fileName === operationsFile?.name ? operationsFile : parkCloseFile;
    if (!localFile) return;
    const url = URL.createObjectURL(localFile);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const mappingStarted = mappingStatus !== "idle";

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] pb-28 text-slate-900">
        <header className="px-1 pt-1">
          <EditableText
            contentKey={mappingStatus === "success" ? "home_generated_title" : mappingStarted ? "home_building_title" : "home_main_title"}
            defaultText={mappingStatus === "success" ? "Mapping Excel generated" : mappingStarted ? "Building mapping Excel" : "Downtime Report Studio"}
            as="h1"
            className="block text-3xl font-extrabold tracking-[-0.045em] text-[#162b5b] sm:text-4xl"
          />
          <EditableText
            contentKey={mappingStatus === "success" ? "home_generated_desc_v27" : mappingStarted ? "home_building_desc_v27" : sourceMode === "saved" ? "home_saved_desc_v27" : "home_main_desc_v27"}
            defaultText={mappingStatus === "success" ? "Your Technical 11-1 downtime mapping is ready to review and download." : mappingStarted ? "Applying selected logs in chronological order." : sourceMode === "saved" ? "Select saved logs and build one Mapping Excel in date order." : "Upload a daily log or reopen a saved log to build a Mapping Excel."}
            as="p"
            className="mt-1 block max-w-xl text-sm leading-6 text-slate-600"
          />
        </header>

        {!mappingStarted ? (
          <>
            <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <Card className="overflow-hidden border-[#adbBda]/70 bg-white/85 shadow-[0_12px_32px_rgba(61,82,160,0.08)]">
                  <CardContent className="p-0">
                    <div className="px-5 pt-5 sm:px-6">
                      <EditableText contentKey="home_source_title" defaultText="Choose your source" as="h2" className="block text-xl font-extrabold tracking-tight text-slate-950" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 border-b border-slate-200 px-3 sm:px-5" role="tablist" aria-label="Downtime source method">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sourceMode === "upload"}
                        onClick={() => changeSourceMode("upload")}
                        className={`flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors ${sourceMode === "upload" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                      >
                        <UploadCloud className="h-4 w-4" />
                        <EditableText contentKey="home_upload_tab" defaultText="Upload new file" />
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sourceMode === "saved"}
                        onClick={() => changeSourceMode("saved")}
                        className={`flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors ${sourceMode === "saved" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                      >
                        <Database className="h-4 w-4" />
                        <EditableText contentKey="home_saved_tab" defaultText="Saved downtime logs" />
                      </button>
                    </div>

                    <div className="p-5 sm:p-6">
                      {sourceMode === "upload" ? (
                        <div>
                          <div className="grid gap-4 lg:grid-cols-2">
                            <FileDropzone
                              label="Operations downtime log (XLSX)"
                              note="Daily Technical 11-1 source log for Mapping Excel generation."
                              required
                              file={operationsFile}
                              onFile={file => { setOperationsFile(file); setResponse(undefined); setError(undefined); }}
                              onClear={() => { setOperationsFile(undefined); setResponse(undefined); setError(undefined); }}
                              acceptExt=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                              badgeLabel="XLSX"
                              icon={FileSpreadsheet}
                            />
                            <FileDropzone
                              label="Park Close log (PDF)"
                              note="Optional daily Park Operations PDF for 10-7 close-time mapping."
                              required={false}
                              file={parkCloseFile}
                              onFile={file => { setParkCloseFile(file); setResponse(undefined); setError(undefined); }}
                              onClear={() => { setParkCloseFile(undefined); setResponse(undefined); setError(undefined); }}
                              acceptExt=".pdf,application/pdf"
                              badgeLabel="PDF"
                              icon={FileText}
                            />
                          </div>
                          <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-xs font-semibold leading-5 text-sky-800" role="status">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Source logs are saved automatically. Uploading the same reporting date replaces the older saved log.</span>
                          </div>
                          {duplicateDate && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900" role="status">
                              <Info className="mt-0.5 h-4 w-4 shrink-0" />
                              <span className="flex-1"><strong className="block">This downtime log already exists in the website.</strong>Uploading it will replace the previous saved version.</span>
                              <button type="button" aria-label="Dismiss duplicate information" onClick={() => setDuplicateDate(undefined)} className="rounded p-0.5 hover:bg-white/70"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          {savedReportsLoading ? (
                            <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading saved downtime logs…</div>
                          ) : savedReportsError ? (
                            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"><TriangleAlert className="mr-2 h-5 w-5" /> Saved downtime logs could not be loaded.</div>
                          ) : !savedReports.length ? (
                            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
                              <CalendarDays className="h-8 w-8 text-sky-600" />
                              <p className="mt-3 text-sm font-extrabold text-slate-900">No saved downtime logs are available yet</p>
                              <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">Upload a new file and enable Save source log to website to recall it later.</p>
                            </div>
                          ) : (
                            <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.9fr)_minmax(320px,1.1fr)]">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-3">
                                <Calendar
                                  mode="multiple"
                                  month={calendarMonth}
                                  onMonthChange={setCalendarMonth}
                                  selected={selectedDateObjects}
                                  onDayClick={handleSavedDateClick}
                                  disabled={day => !availableDateKeys.includes(dateKey(day))}
                                  weekStartsOn={1}
                                  modifiers={calendarModifiers}
                                  className="mx-auto w-full max-w-[360px] bg-transparent [--cell-size:--spacing(9)]"
                                  classNames={{ caption_label: "text-sm font-extrabold text-slate-900", weekday: "text-slate-500 text-[11px] font-bold flex-1" }}
                                />
                                <div className="mt-2 flex flex-wrap items-center justify-center gap-4 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-500" /> Saved log</span>
                                  <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-emerald-700" /> Selected</span>
                                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-400 border border-slate-500" /> Dark day</span>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold text-sky-700">{orderedSelectedReports.length} saved log{orderedSelectedReports.length === 1 ? "" : "s"} selected</p>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <h3 className="text-lg font-extrabold text-slate-950">Mapping order</h3>
                                  {orderedSelectedReports.length > 0 && <button type="button" onClick={() => setSelectedSavedIds(new Set())} className="text-xs font-bold text-sky-700 hover:text-sky-900">Clear selection</button>}
                                </div>
                                <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                                  {orderedSelectedReports.length ? orderedSelectedReports.map((report, index) => (
                                    <button key={report.id} type="button" onClick={() => toggleSavedReport(report)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-rose-50">
                                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-extrabold text-white">{index + 1}</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold text-slate-900">{formatDate(report.reportDate)}</span>
                                        <span className="block truncate text-[10px] text-slate-500">{report.sourceFileName}</span>
                                      </span>
                                      <span className="shrink-0 text-xs font-bold text-sky-800">{report.totalTechnicalMinutes} min</span>
                                    </button>
                                  )) : (
                                    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 text-center">
                                      <ListOrdered className="h-6 w-6 text-slate-400" />
                                      <p className="mt-2 text-sm font-bold text-slate-700">Select dates on the calendar</p>
                                      <p className="mt-1 text-xs leading-5 text-slate-500">Selected logs will appear here in chronological order.</p>
                                    </div>
                                  )}
                                </div>
                                <p className="mt-3 text-[11px] font-semibold leading-4 text-emerald-800">Mapping Excel will follow the selected dates in chronological order.</p>
                                <button type="button" onClick={openSourceFiles} disabled={!orderedSelectedReports.length} className="mt-2 text-xs font-bold text-sky-700 disabled:cursor-not-allowed disabled:opacity-40">View selected logs</button>
                                <div className="mt-3 flex gap-2 rounded-xl bg-sky-50 p-3 text-[11px] leading-4 text-sky-800"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Saved source logs can be reopened and processed from any signed-in device.</div>
                                {duplicateDate && (
                                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs font-extrabold text-amber-900">Choose one log for {formatDate(duplicateDate)}</p>
                                    <div className="mt-2 space-y-1.5">
                                      {(reportsByDate.get(duplicateDate) ?? []).map(report => (
                                        <button key={report.id} type="button" onClick={() => toggleSavedReport(report)} className="block w-full rounded-lg bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-amber-100">{report.sourceFileName}</button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Collapsible open={contextOpen} onOpenChange={setContextOpen} className="overflow-hidden rounded-2xl border border-[#adbBda]/70 bg-white/90 shadow-[0_10px_26px_rgba(61,82,160,0.07)]">
                  <CollapsibleTrigger className="flex w-full items-center gap-3 p-5 text-left sm:px-6" aria-label="Toggle additional context">
                    <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FileText className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><EditableText contentKey="home_context_title" defaultText="Additional context" as="span" className="block text-base font-extrabold tracking-tight text-slate-950" /><EditableText contentKey="home_context_collapsed_desc" defaultText="Add handover closure or 11-3 weather messages if needed." as="span" className="mt-0.5 block text-xs leading-5 text-slate-500" /></span>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Optional</Badge>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${contextOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-slate-100 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                    <div className="space-y-3">
                      <Collapsible open={handoverOpen} onOpenChange={setHandoverOpen} className="rounded-2xl border border-slate-200 bg-white">
                        <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left">
                          <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><CircleOff className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <EditableText contentKey="home_handover_title" defaultText="Handover closure" as="span" className="block text-sm font-extrabold text-slate-900" />
                            <EditableText contentKey="home_handover_desc" defaultText="Add a ride only when it did not hand over and is not marked CLOSED in the Operations log." as="span" className="mt-0.5 block text-xs leading-5 text-slate-500" />
                          </span>
                          <Badge variant="outline" className="border-amber-200 text-amber-800">{handoverClosedRides.length || "Optional"}</Badge>
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${handoverOpen ? "rotate-180" : ""}`} />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <div className="mb-3 flex items-center justify-between gap-4 rounded-xl bg-amber-50 px-3 py-2.5">
                            <span className="text-xs font-semibold text-amber-900">Enable manual handover closure selection</span>
                            <Switch checked={handoverEnabled} onCheckedChange={setHandoverEnabled} aria-label="Enable handover closure selection" />
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Select value={closureToAdd} onValueChange={setClosureToAdd} disabled={!handoverEnabled}>
                              <SelectTrigger className="h-10 flex-1 rounded-xl bg-white"><SelectValue placeholder="Select a closed ride" /></SelectTrigger>
                              <SelectContent>
                                {HANDOVER_RIDES.filter(([code]) => !handoverClosedRides.includes(code)).map(([code, name]) => <SelectItem key={code} value={code}><span className="font-mono-report font-bold">{code}</span><span className="ml-2 text-slate-500">{name}</span></SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" onClick={addHandoverClosure} disabled={!handoverEnabled || !closureToAdd} className="h-10 rounded-xl border-amber-200 bg-white font-bold text-amber-900">Add ride</Button>
                          </div>
                          {handoverClosedRides.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{handoverClosedRides.map(code => <button key={code} type="button" onClick={() => setHandoverClosedRides(current => current.filter(item => item !== code))} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"><span className="font-mono-report">{code}</span><X className="h-3 w-3" /></button>)}</div>}
                        </CollapsibleContent>
                      </Collapsible>

                      <Collapsible open={weatherOpen} onOpenChange={setWeatherOpen} className="rounded-2xl border border-slate-200 bg-white">
                        <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left">
                          <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><CloudSun className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <EditableText contentKey="home_weather_title_v27" defaultText="Weather / 11-3 messages" as="span" className="block text-sm font-extrabold text-slate-900" />
                            <EditableText contentKey="home_weather_desc_v27" defaultText="Weather maps 11-3 messages to the report timeline automatically." as="span" className="mt-0.5 block text-xs leading-5 text-slate-500" />
                          </span>
                          <Badge className="hidden bg-emerald-100 text-emerald-800 hover:bg-emerald-100 sm:inline-flex"><CheckCircle2 className="mr-1 h-3 w-3" />Automatic mapping enabled</Badge>
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${weatherOpen ? "rotate-180" : ""}`} />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <Textarea value={weatherText} onChange={event => setWeatherText(event.target.value)} placeholder={sourceMode === "saved" && orderedSelectedReports.length > 1 ? "Manual weather text is available for single-date saved mappings. Automatic source-log mapping remains active." : "Optional: paste manual 11-3 and 11-8 messages…"} disabled={sourceMode === "saved" && orderedSelectedReports.length > 1} className="min-h-28 resize-y rounded-xl border-sky-200 bg-white text-sm" />
                          <p className="mt-2 text-[11px] leading-5 text-sky-800">Automatic 11-3 rows in each Operations log are always included. Manual messages are applied only when their mapping context is unambiguous.</p>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <Card className="border-[#adbBda]/70 bg-white/90 shadow-[0_12px_32px_rgba(61,82,160,0.09)] xl:sticky xl:top-4">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <span className={`flex size-8 items-center justify-center rounded-lg ${validSource ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-500"}`}>{validSource ? <Check className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span>
                    <EditableText contentKey="home_readiness_title" defaultText="Mapping readiness" as="h2" className="block text-lg font-extrabold text-slate-950" />
                  </div>
                  {sourceMode === "upload" ? (
                    operationsFile || parkCloseFile ? <div className="divide-y divide-slate-100">
                      {operationsFile && <StatusRow title="Downtime log loaded" detail={operationsFile.name} />}
                      {parkCloseFile && <StatusRow title="Park Close log loaded" detail={parkCloseFile.name} />}
                    </div> : <div className="py-5 text-center text-xs leading-5 text-slate-500">Add an Operations downtime log to see source readiness.</div>
                  ) : (
                    orderedSelectedReports.length ? <div className="divide-y divide-slate-100">{orderedSelectedReports.map(report => <StatusRow key={report.id} title="Downtime log loaded" detail={`${formatDate(report.reportDate)} · ${report.sourceFileName}`} />)}</div> : <div className="py-5 text-center text-xs leading-5 text-slate-500">Choose a saved downtime log to see source readiness.</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {error && <div className="mt-4 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

            <div className="sticky bottom-4 z-30 mt-5 flex flex-col gap-4 rounded-2xl border border-emerald-700/20 bg-emerald-800 px-4 py-4 text-white shadow-[0_18px_50px_rgba(4,120,87,0.28)] sm:flex-row sm:items-center sm:justify-between sm:px-5 xl:pr-48">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 sm:flex"><FileCheck2 className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-extrabold">Ready to build mapping Excel.</p>
                  <p className="mt-0.5 text-xs text-emerald-50/85">Source logs are saved automatically; re-uploading the same date replaces the prior saved version.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" disabled={!validSource} onClick={openSourceFiles} className="h-10 rounded-xl border-white/50 bg-transparent font-bold text-white hover:bg-white/10 hover:text-white"><FileText className="mr-2 h-4 w-4" />View source files</Button>
                <Button type="button" disabled={!validSource} onClick={buildMappingExcel} className="h-10 rounded-xl bg-white px-5 font-extrabold text-emerald-800 hover:bg-emerald-50 active:scale-[0.97]">Build mapping Excel<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="overflow-hidden border-[#adbBda]/70 bg-white/90 shadow-[0_12px_32px_rgba(61,82,160,0.09)]">
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <EditableText contentKey="home_mapping_preview_title" defaultText="Mapping Excel preview" as="h2" className="block text-xl font-extrabold tracking-tight text-slate-950" />
                    <p className="mt-1 text-xs text-slate-500">Technical 11-1 rows are shown in selected-date order.</p>
                  </div>
                  {mappingStatus === "success" ? <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Generated successfully</Badge> : mappingStatus === "error" ? <Badge className="w-fit bg-rose-100 text-rose-800 hover:bg-rose-100"><TriangleAlert className="mr-1 h-3.5 w-3.5" />Generation stopped</Badge> : <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Generating…</Badge>}
                </div>

                {mappingStatus === "error" ? (
                  <div className="m-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
                    <TriangleAlert className="h-9 w-9 text-rose-600" />
                    <h3 className="mt-4 text-lg font-extrabold text-rose-950">Mapping Excel was not generated</h3>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-rose-800">{error}</p>
                    <div className="mt-5 flex gap-2"><Button variant="outline" onClick={resetResult} className="bg-white"><ArrowLeft className="mr-2 h-4 w-4" />Return to sources</Button><Button onClick={buildMappingExcel} className="bg-emerald-800 text-white hover:bg-emerald-700"><RotateCcw className="mr-2 h-4 w-4" />Retry</Button></div>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[380px] overflow-auto border-b border-slate-200">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                          <tr><th className="px-5 py-3">Ride</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Technical downtime</th><th className="px-4 py-3">Downtime %</th><th className="px-4 py-3">Event remarks</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mappingStatus === "processing" ? Array.from({ length: 7 }).map((_, index) => (
                            <tr key={index}>{Array.from({ length: 5 }).map((__, cell) => <td key={cell} className="px-4 py-3"><span className={`block h-3 animate-pulse rounded-full bg-slate-100 ${cell === 4 ? "w-4/5" : cell === 2 ? "w-2/3" : "w-1/2"}`} /></td>)}</tr>
                          )) : previewRows.length ? previewRows.map(record => (
                            <tr key={`${record.dateKey}-${record.sourceRow}-${record.rideCode ?? record.attraction}`} className="align-top">
                              <td className="px-5 py-3 font-bold text-slate-900"><span className="font-mono-report text-emerald-800">{record.rideCode ?? "—"}</span><span className="mt-0.5 block max-w-44 truncate text-[10px] font-normal text-slate-500">{record.attraction}</span></td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{formatDate(record.dateKey, false)}</td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono-report font-bold text-sky-800">{record.technicalMinutes} min</td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono-report font-bold text-amber-800">{record.downtimePercentage.toFixed(2)}%</td>
                              <td className="max-w-64 px-4 py-3 leading-5 text-slate-600">{record.description || "Mapped technical incident"}</td>
                            </tr>
                          )) : <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No matched Technical 11-1 rows were available for preview.</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    <section className="p-5 sm:p-6">
                      <h3 className="text-base font-extrabold text-[#172c5b]">Summary</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Rides affected", `${response?.summaryByRide.filter(ride => ride.minutes > 0).length ?? 0}`],
                          ["Total downtime", `${response?.totalTechnicalMinutes ?? 0} min`],
                          ["Incidents", `${response?.matchedCount ?? 0}`],
                          ["Dates", `${resultDates.length}`],
                        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1.5 text-xl font-extrabold text-[#172c5b]">{value}</p></div>)}
                      </div>
                    </section>
                    <section className="border-t border-slate-100 p-5 sm:p-6">
                      <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-sky-700" /><div><h3 className="text-base font-extrabold text-[#172c5b]">Daily downtime</h3><p className="text-xs text-slate-500">Downtime in minutes</p></div></div>
                      <div className="mt-4 h-56" role="img" aria-label={dailySummary.map(day => `${formatDate(day.dateKey)}: ${day.technicalMinutes} minutes, ${severityForMinutes(day.technicalMinutes).label}`).join("; ") || "Daily downtime chart is being prepared"}>
                        {mappingStatus === "processing" ? <div className="flex h-full items-end gap-5 rounded-xl border border-slate-100 bg-slate-50 px-8 pb-5">{[38, 68, 49, 78, 55].map((height, index) => <div key={index} className="flex-1 animate-pulse rounded-t-lg bg-slate-200" style={{ height: `${height}%` }} />)}</div> : dailySummary.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={dailySummary} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="rgb(112 145 230 / 0.22)" /><XAxis dataKey="dateKey" tickFormatter={(value: string) => formatDate(value, false)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#596783" }} /><YAxis width={64} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#596783" }} tickFormatter={(value: number) => `${value}m`} /><Tooltip cursor={{ fill: "rgb(112 145 230 / 0.10)" }} content={<MappingTooltip />} /><Bar dataKey="technicalMinutes" radius={[7, 7, 0, 0]}>{dailySummary.map(day => <Cell key={day.dateKey} fill={severityForMinutes(day.technicalMinutes).color} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No daily downtime values available.</div>}
                      </div>
                    </section>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#adbBda]/70 bg-white/90 shadow-[0_12px_32px_rgba(61,82,160,0.09)] xl:sticky xl:top-4">
              <CardContent className="p-5">
                <h2 className="text-lg font-extrabold text-slate-950">Mapping applied</h2>
                <div className="mt-4 rounded-xl bg-emerald-50/70 p-3" aria-live="polite">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                    <span>
                      {mappingStatus === "success" ? `${totalMappingSteps} of ${totalMappingSteps}` : `${currentStepIndex} of ${totalMappingSteps}`} mapping steps completed
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-700 transition-[width] duration-200 ease-out" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {mappingStatus === "success" && response ? <Button asChild className="h-11 w-full rounded-xl bg-emerald-800 font-extrabold text-white hover:bg-emerald-700"><a href={response.downloadUrl} download={response.outputFileName}><Download className="mr-2 h-4 w-4" />Download mapping Excel</a></Button> : <Button disabled className="h-11 w-full rounded-xl"><Download className="mr-2 h-4 w-4" />Download mapping Excel</Button>}
                  <Button type="button" variant="outline" disabled={mappingStatus !== "success"} onClick={openSourceFiles} className="h-10 w-full rounded-xl bg-white font-bold"><ExternalLink className="mr-2 h-4 w-4" />Open source {sourceFilesForDialog.length === 1 ? "log" : "logs"}</Button>
                  {mappingStatus === "success" && <Button type="button" variant="outline" onClick={resetResult} className="h-10 w-full rounded-xl bg-white font-bold text-sky-700"><RotateCcw className="mr-2 h-4 w-4" />Build another mapping</Button>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle>{sourceFilesForDialog.length === 1 ? "Source log" : "Source logs"}</DialogTitle>
              <DialogDescription>Review the source files used for this Mapping Excel.</DialogDescription>
            </DialogHeader>
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {sourceFilesForDialog.length ? sourceFilesForDialog.map((source, index) => (
                <button key={`${source.id ?? source.fileName}-${index}`} type="button" onClick={() => openSource(source)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:bg-sky-50">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm"><FileSpreadsheet className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{source.fileName}</span>{source.reportDate && <span className="mt-0.5 block text-[11px] text-slate-500">{formatDate(source.reportDate)}</span>}</span>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </button>
              )) : <p className="py-8 text-center text-sm text-slate-500">No source file is currently selected.</p>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
