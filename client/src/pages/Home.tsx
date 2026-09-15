import { useAuth } from "@/_core/hooks/useAuth";
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

const MAPPING_STEPS = [
  ["Source logs read", "Source files were received and validated."],
  ["Technical 11-1 rows selected", "Filtering and validating relevant rows."],
  ["AVL downtime excluded", "AVL-related downtime is excluded from the mapping."],
  ["Weather messages mapped", "Applying available 11-3 weather intervals."],
  ["Handover closures applied", "Applying confirmed handover closure logic."],
  ["Downtime percentage written", "Writing calculated downtime percentages to the template."],
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
  const { user } = useAuth();
  const { data: savedReportsData = [], isLoading: savedReportsLoading, error: savedReportsError } = trpc.savedReports.list.useQuery();
  const savedReports = savedReportsData as SavedReport[];
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [operationsFile, setOperationsFile] = useState<File>();
  const [parkCloseFile, setParkCloseFile] = useState<File>();
  const [selectedSavedIds, setSelectedSavedIds] = useState<Set<number>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState<Date>();
  const [duplicateDate, setDuplicateDate] = useState<string>();
  const [saveToStorage, setSaveToStorage] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [handoverEnabled, setHandoverEnabled] = useState(false);
  const [handoverClosedRides, setHandoverClosedRides] = useState<string[]>([]);
  const [closureToAdd, setClosureToAdd] = useState<string>();
  const [weatherText, setWeatherText] = useState("");
  const [mappingStatus, setMappingStatus] = useState<MappingStatus>("idle");
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
  const canSaveUpload = Boolean(user);
  const primaryLabel = sourceMode === "upload" && saveToStorage ? "Save & build mapping Excel" : "Build mapping Excel";
  const mappingReadyTitle = !validSource
    ? sourceMode === "upload" ? "Add a downtime log to continue" : "Select at least one saved log"
    : sourceMode === "saved" && orderedSelectedReports.length > 1 ? "Ready to build multi-date mapping Excel" : sourceMode === "upload" && saveToStorage ? "Ready to save and build mapping Excel" : "Ready to build mapping Excel";
  const mappingReadyDetail = !validSource
    ? sourceMode === "upload" ? "An Operations downtime XLSX file is required." : "Use the calendar to select saved-log dates."
    : sourceMode === "saved" ? `${orderedSelectedReports.length} saved source log${orderedSelectedReports.length === 1 ? "" : "s"} selected · ${formatDateRange(orderedDates)}`
      : saveToStorage ? "The uploaded source log will be saved to the website." : "The uploaded source log will be used for this mapping only.";

  const selectedDateObjects = useMemo(() => orderedDates.map(dateFromKey), [orderedDates]);
  const calendarModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = {
      savedLog: availableDateKeys.map(dateFromKey),
      mappingSelected: selectedDateObjects,
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

  const buildMappingExcel = async () => {
    if (!validSource || mappingStatus === "processing") return;
    setMappingStatus("processing");
    setResponse(undefined);
    setError(undefined);
    setWorkbookTab("sheet");
    try {
      let result: Response;
      if (sourceMode === "upload") {
        const formData = new FormData();
        formData.append("operationsFile", operationsFile!);
        formData.append("closedRideCodes", JSON.stringify(handoverEnabled ? handoverClosedRides : []));
        formData.append("saveToStorage", String(saveToStorage && canSaveUpload));
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
      const payload = await result.json() as ProcessingResponse & { error?: string };
      if (!result.ok) throw new Error(payload.error ?? "The Mapping Excel could not be generated.");
      setResponse(payload);
      setMappingStatus("success");
      toast.success("Mapping Excel generated successfully.");
    } catch (caught) {
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
  const completedSteps = mappingStatus === "success" ? MAPPING_STEPS.length : mappingStatus === "processing" ? 1 : 0;
  const progressPercent = Math.round(completedSteps / MAPPING_STEPS.length * 100);

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] pb-3 text-slate-900">
        <section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-[#adbBda]/70 px-5 py-6 shadow-[0_18px_50px_rgba(61,82,160,0.13)] sm:px-8">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <Badge className="rounded-full bg-emerald-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-emerald-700">
                <EditableText contentKey="home_badge_pill" defaultText="Park operations" />
              </Badge>
              <EditableText
                contentKey={mappingStatus === "success" ? "home_generated_title" : mappingStarted ? "home_building_title" : "home_main_title"}
                defaultText={mappingStatus === "success" ? "Mapping Excel generated" : mappingStarted ? "Building mapping Excel" : "Downtime Report Studio"}
                as="h1"
                className="mt-3 block text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl"
              />
              <EditableText
                contentKey={mappingStatus === "success" ? "home_generated_desc_v27" : mappingStarted ? "home_building_desc_v27" : sourceMode === "saved" ? "home_saved_desc_v27" : "home_main_desc_v27"}
                defaultText={mappingStatus === "success" ? "Your Technical 11-1 downtime mapping is ready to review and download." : mappingStarted ? "Applying selected logs in chronological order." : sourceMode === "saved" ? "Select saved logs and build one Mapping Excel in date order." : "Upload a daily log or reopen a saved log to build a Mapping Excel."}
                as="p"
                className="mt-2 block max-w-xl text-sm leading-6 text-slate-700"
              />
            </div>
            <WorkflowStepper status={mappingStatus} sourceReady={validSource} />
          </div>
        </section>

        {!mappingStarted ? (
          <>
            <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <Card className="overflow-hidden border-[#adbBda]/70 bg-white/85 shadow-[0_12px_32px_rgba(61,82,160,0.08)]">
                  <CardContent className="p-0">
                    <div className="px-5 pt-5 sm:px-6">
                      <EditableText contentKey="home_source_title" defaultText="1. Choose your source" as="h2" className="block text-xl font-extrabold tracking-tight text-slate-950" />
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
                          {operationsFile && (
                            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                              <Switch
                                id="save-source-log"
                                checked={saveToStorage && canSaveUpload}
                                disabled={!canSaveUpload}
                                onCheckedChange={setSaveToStorage}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <label htmlFor="save-source-log" className="cursor-pointer text-sm font-extrabold text-slate-900"><EditableText contentKey="home_save_source_title_v27" defaultText="Save source log to website" /></label>
                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                  {canSaveUpload ? "Store this source file securely so it can be recalled and reprocessed from any signed-in device." : "Sign in from the sidebar to enable secure cross-device source recall."}
                                </p>
                              </div>
                              <Archive className="ml-auto h-5 w-5 shrink-0 text-emerald-700" />
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
                                <div className="mt-2 flex items-center justify-center gap-5 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-500" /> Saved log</span>
                                  <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-emerald-700" /> Selected</span>
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

                <Card className="border-[#adbBda]/70 bg-white/85 shadow-[0_12px_32px_rgba(61,82,160,0.08)]">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <EditableText contentKey="home_context_title" defaultText="2. Additional context" as="h2" className="block text-xl font-extrabold tracking-tight text-slate-950" />
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Optional</Badge>
                    </div>
                    <div className="mt-4 space-y-3">
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
                  </CardContent>
                </Card>
              </div>

              <Card className="border-[#adbBda]/70 bg-white/90 shadow-[0_12px_32px_rgba(61,82,160,0.09)] xl:sticky xl:top-4">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <span className={`flex size-8 items-center justify-center rounded-lg ${validSource ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-500"}`}>{validSource ? <Check className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span>
                    <EditableText contentKey="home_readiness_title" defaultText="Mapping readiness" as="h2" className="block text-lg font-extrabold text-slate-950" />
                  </div>
                  {sourceMode === "upload" ? (
                    <div className="divide-y divide-slate-100">
                      <StatusRow tone={operationsFile ? "complete" : "pending"} title={operationsFile ? "Downtime log loaded" : "Downtime log required"} detail={operationsFile ? `${operationsFile.name}${reportDateFromFileName(operationsFile.name) ? ` · Detected report date: ${formatDate(reportDateFromFileName(operationsFile.name)!)}` : " · Report date will be detected during mapping."}` : "Add an Operations downtime XLSX file."} />
                      <StatusRow tone={parkCloseFile ? "complete" : "optional"} title={parkCloseFile ? "Park Close log loaded" : "Park Close log not added — optional"} detail={parkCloseFile?.name ?? "A PDF is not required to build the Mapping Excel."} />
                      <StatusRow title="Technical 11-1 scope confirmed" detail={weatherText.trim() ? "Technical rows plus supplied weather context." : "Weather, ride, and closure context is used only when available."} />
                      <StatusRow title="AVL excluded" detail="Not included in this mapping." />
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <StatusRow tone={orderedSelectedReports.length ? "complete" : "pending"} title={orderedSelectedReports.length ? `${orderedSelectedReports.length} saved log${orderedSelectedReports.length === 1 ? "" : "s"} selected` : "Saved log selection required"} detail={orderedSelectedReports.length ? `${formatDateRange(orderedDates)}· ${orderedSelectedReports.length} log${orderedSelectedReports.length === 1 ? "" : "s"}` : "Choose at least one marked date."} />
                      <StatusRow tone={orderedSelectedReports.length ? "complete" : "pending"} title="Date order confirmed" detail={orderedSelectedReports.length ? "In chronological order" : "Order appears after selection"} />
                      <StatusRow title="Technical 11-1 scope confirmed" detail="Weather and ride closure scope follows each saved source." />
                      <StatusRow title="AVL excluded" detail="Not included in this mapping." />
                      <StatusRow tone="optional" title="Optional context" detail="Park Close log and manual weather context are optional." />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {error && <div className="mt-4 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

            <div className="sticky bottom-4 z-30 mt-5 flex flex-col gap-4 rounded-2xl border border-emerald-700/20 bg-emerald-800 px-4 py-4 text-white shadow-[0_18px_50px_rgba(4,120,87,0.28)] sm:flex-row sm:items-center sm:justify-between sm:px-5 xl:pr-48">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 sm:flex"><FileCheck2 className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-extrabold">{mappingReadyTitle}</p>
                  <p className="mt-0.5 text-xs text-emerald-50/85">{mappingReadyDetail}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" disabled={!validSource} onClick={openSourceFiles} className="h-10 rounded-xl border-white/50 bg-transparent font-bold text-white hover:bg-white/10 hover:text-white">View source {sourceMode === "saved" && orderedSelectedReports.length > 1 ? "logs" : "file"}</Button>
                <Button type="button" disabled={!validSource} onClick={buildMappingExcel} className="h-10 rounded-xl bg-white px-5 font-extrabold text-emerald-800 hover:bg-emerald-50 active:scale-[0.97]">{primaryLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button>
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
                    <div className="overflow-x-auto">
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

                    <div className="border-t border-slate-200 bg-slate-50/65 px-4 pt-2">
                      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Mapping Excel preview tabs">
                        {([
                          ["sheet", "WK_template_v4", FileSpreadsheet],
                          ["summary", "Summary", Sparkles],
                          ["chart", "Downtime chart", BarChart3],
                        ] as const).map(([tab, label, Icon]) => <button key={tab} type="button" role="tab" aria-selected={workbookTab === tab} onClick={() => setWorkbookTab(tab)} className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-bold transition-colors ${workbookTab === tab ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
                      </div>
                    </div>

                    <div className="min-h-64 p-5 sm:p-6">
                      {workbookTab === "chart" ? (
                        <div>
                          <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-sky-700" /><div><h3 className="text-sm font-extrabold text-slate-900">Downtime trend</h3><p className="text-xs text-slate-500">{mappingStatus === "processing" ? "Preparing daily downtime chart" : "Daily Technical 11-1 downtime in chronological order"}</p></div></div>
                          <div className="mt-4 h-56" role="img" aria-label={dailySummary.map(day => `${formatDate(day.dateKey)}: ${day.technicalMinutes} minutes, ${severityForMinutes(day.technicalMinutes).label}`).join("; ") || "Daily downtime chart is being prepared"}>
                            {mappingStatus === "processing" ? <div className="flex h-full items-end gap-5 rounded-xl border border-slate-100 bg-slate-50 px-8 pb-5">{[38, 68, 49, 78, 55].map((height, index) => <div key={index} className="flex-1 animate-pulse rounded-t-lg bg-slate-200" style={{ height: `${height}%` }} />)}</div> : dailySummary.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={dailySummary} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="rgb(112 145 230 / 0.22)" /><XAxis dataKey="dateKey" tickFormatter={(value: string) => formatDate(value, false)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#596783" }} /><YAxis width={64} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#596783" }} tickFormatter={(value: number) => `${value}m`} /><Tooltip cursor={{ fill: "rgb(112 145 230 / 0.10)" }} content={<MappingTooltip />} /><Bar dataKey="technicalMinutes" radius={[7, 7, 0, 0]}>{dailySummary.map(day => <Cell key={day.dateKey} fill={severityForMinutes(day.technicalMinutes).color} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No daily downtime values available.</div>}
                          </div>
                          {dailySummary.length === 1 && mappingStatus === "success" && <p className="mt-2 text-center text-[11px] text-slate-500">This chart represents the single selected day.</p>}
                        </div>
                      ) : workbookTab === "summary" && response ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[['Rides affected', `${response.summaryByRide.filter(ride => ride.minutes > 0).length}`], ['Technical downtime', `${response.totalTechnicalMinutes} min`], ['Recorded incidents', `${response.matchedCount}`], ['Dates mapped', `${resultDates.length}`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p></div>)}
                        </div>
                      ) : (
                        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/65 p-6 text-center">
                          <div><FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-700" /><p className="mt-3 text-sm font-extrabold text-slate-900">WK_template_v4 mapping sheet</p><p className="mt-1 text-xs leading-5 text-slate-500">{mappingStatus === "processing" ? "The workbook timeline, percentages, closure highlights, and weather mappings are being prepared." : `${resultDates.length} selected date${resultDates.length === 1 ? "" : "s"} mapped in chronological worksheet order.`}</p></div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#adbBda]/70 bg-white/90 shadow-[0_12px_32px_rgba(61,82,160,0.09)] xl:sticky xl:top-4">
              <CardContent className="p-5">
                <h2 className="text-lg font-extrabold text-slate-950">Mapping applied</h2>
                <div className="mt-3 divide-y divide-slate-100" aria-live="polite">
                  {MAPPING_STEPS.map(([title, detail], index) => {
                    const complete = index < completedSteps;
                    const active = mappingStatus === "processing" && index === completedSteps;
                    return <div key={title} className="flex gap-3 py-3">{complete ? <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"><Check className="h-3.5 w-3.5" /></span> : active ? <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-emerald-700"><Loader2 className="h-5 w-5 animate-spin" /></span> : <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-300"><Circle className="h-3 w-3 text-slate-300" /></span>}<div><p className={`text-sm font-bold ${complete || active ? "text-slate-900" : "text-slate-500"}`}>{title}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{complete ? `Completed — ${detail}` : detail}</p></div></div>;
                  })}
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-800"><span>{completedSteps} of {MAPPING_STEPS.length} mapping steps completed</span><span>{progressPercent}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-700 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div>
                </div>
                <div className="mt-3 flex gap-2 rounded-xl bg-sky-50 p-3 text-[11px] leading-5 text-sky-800"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" /><span>{mappingStatus === "processing" ? "Processing" : "Processed"} {resultDates.length || (sourceMode === "saved" ? orderedDates.length : 1)} selected day{(resultDates.length || orderedDates.length) === 1 ? "" : "s"} in date order{(resultDates.length ? resultDates : orderedDates).length ? `: ${(resultDates.length ? resultDates : orderedDates).map(value => formatDate(value, false)).join(" → ")}` : "."}</span></div>
                {mappingStatus === "success" && response && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rides affected</p><p className="mt-1 text-lg font-extrabold">{response.summaryByRide.filter(ride => ride.minutes > 0).length}</p></div>
                    <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Downtime</p><p className="mt-1 text-lg font-extrabold">{response.totalTechnicalMinutes} min</p></div>
                    <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Incidents</p><p className="mt-1 text-lg font-extrabold">{response.matchedCount}</p></div>
                    <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dates</p><p className="mt-1 text-lg font-extrabold">{resultDates.length}</p></div>
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  {mappingStatus === "success" && response ? <Button asChild className="h-11 w-full rounded-xl bg-emerald-800 font-extrabold text-white hover:bg-emerald-700"><a href={response.downloadUrl} download={response.outputFileName}><Download className="mr-2 h-4 w-4" />Download mapping Excel</a></Button> : <Button disabled className="h-11 w-full rounded-xl"><Download className="mr-2 h-4 w-4" />Download mapping Excel</Button>}
                  <Button type="button" variant="outline" disabled={mappingStatus !== "success"} onClick={openSourceFiles} className="h-10 w-full rounded-xl bg-white font-bold"><ExternalLink className="mr-2 h-4 w-4" />Open source {sourceFilesForDialog.length === 1 ? "log" : "logs"}</Button>
                  {mappingStatus === "success" && <Button type="button" variant="ghost" onClick={resetResult} className="h-10 w-full font-bold text-sky-700"><RotateCcw className="mr-2 h-4 w-4" />Build another mapping</Button>}
                </div>
                {mappingStatus === "success" && <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">{resultDates.length === 1 ? "Source" : "Sources"}: {sourceFilesForDialog.map(source => source.fileName).join(" · ")}{response?.savedToLibrary ? " · Saved to website" : ""}</p>}
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
