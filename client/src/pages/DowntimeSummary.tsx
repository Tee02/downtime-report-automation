import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

type SummaryTab = "editor" | "archive";

type SummaryIncident = {
  incidentKey: string;
  zone: "Zone A" | "Zone B";
  rideCode: string;
  attraction: string;
  description: string;
  downtimeStart: string;
  downtimeEnd: string;
  durationMinutes: number;
  shift: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  partsReplaced?: string | null;
  followUpAction?: string | null;
  anrNo?: string | null;
  supportInfo?: string | null;
  supportPhotoUrl?: string | null;
  supportPhotoName?: string | null;
  status: string;
};

// Official Zone definitions per Availability matrix and user guidance:
// Zone A (formerly Zone 1): BWZ, RTR, ESD, IDD, NTM, PTA, POTA, BCT (EV/RC/UZ/ZC), AFP, TTC
// Zone B (formerly Zone 2): MFZ, ACR, SRS, ETI, EHF, VTM, BSC, RCC, SAG
const ZONE_ASSIGNMENTS: Record<string, "Zone A" | "Zone B"> = {
  BWZ: "Zone A",
  RTR: "Zone A",
  ESD: "Zone A",
  IDD: "Zone A",
  NTM: "Zone A",
  PTA: "Zone A",
  POTA: "Zone A",
  "BCT (EV)": "Zone A",
  "BCT (RC)": "Zone A",
  "BCT (UZ)": "Zone A",
  "BCT (ZC)": "Zone A",
  AFP: "Zone A",
  TTC: "Zone A",
  MFZ: "Zone B",
  ACR: "Zone B",
  SRS: "Zone B",
  ETI: "Zone B",
  EHF: "Zone B",
  VTM: "Zone B",
  BSC: "Zone B",
  RCC: "Zone B",
  SAG: "Zone B",
};

function formatDisplayDate(dateKey: string) {
  if (!dateKey) return "";
  const parts = dateKey.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[0];
    return `${day}/${month}/${year}`;
  }
  return dateKey;
}

function parseShift(downtimeStart: string): string {
  const clean = (downtimeStart || "").replace(":", "");
  const num = parseInt(clean, 10);
  if (!isNaN(num) && num >= 1400) return "PM";
  return "AM";
}

function parseDurationMinutes(durationLabel?: string, startTime?: string, endTime?: string): number {
  if (durationLabel) {
    const hourMatch = /(\d+)\s*(?:hour|hr|h)\b/i.exec(durationLabel);
    const minMatch = /(\d+)\s*(?:minute|min|m)\b/i.exec(durationLabel);
    let total = 0;
    if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
    if (minMatch) total += parseInt(minMatch[1], 10);
    if (total > 0) return total;
  }
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      const s = sh * 60 + sm;
      const e = eh * 60 + em;
      return e >= s ? e - s : 1440 - s + e;
    }
  }
  return 0;
}

function normalizeZone(raw?: string | null): "Zone A" | "Zone B" {
  if (!raw) return "Zone A";
  if (raw === "Zone 2" || raw === "Zone B") return "Zone B";
  return "Zone A";
}

export default function DowntimeSummary() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const dateKey = searchParams.get("date") || "";

  const [activeTab, setActiveTab] = useState<SummaryTab>("editor");
  const [selectedIncidentKey, setSelectedIncidentKey] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<"ALL" | "Zone A" | "Zone B">("ALL");
  const [amExecutive, setAmExecutive] = useState("");
  const [pmExecutive, setPmExecutive] = useState("");
  const [zoneBAmExecutive, setZoneBAmExecutive] = useState("");
  const [zoneBPmExecutive, setZoneBPmExecutive] = useState("");
  const [incidents, setIncidents] = useState<SummaryIncident[]>([]);
  const [selectedKeysForExport, setSelectedKeysForExport] = useState<Set<string>>(new Set());
  const [archiveSelectedDate, setArchiveSelectedDate] = useState<string>(dateKey);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isArchiveDragging, setIsArchiveDragging] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: savedReports = [] } = trpc.savedReports.list.useQuery();
  const currentSavedReport = useMemo(() => {
    return savedReports.find(report => report.reportDate === dateKey);
  }, [savedReports, dateKey]);

  // Read analysis data for active editor date
  const analysisQuery = trpc.analysis.get.useQuery(
    {
      reportIds: currentSavedReport ? [currentSavedReport.id] : [],
      rideCodes: [],
    },
    { enabled: Boolean(currentSavedReport) }
  );

  // Read saved summary state for active editor date
  const summaryQuery = trpc.downtimeSummary.getByDate.useQuery(
    { dateKey },
    { enabled: Boolean(dateKey) }
  );

  // Read target report for archive tab date (even if not saved yet, we preview raw technical logs!)
  const archiveTargetReport = useMemo(() => {
    return savedReports.find(report => report.reportDate === archiveSelectedDate);
  }, [savedReports, archiveSelectedDate]);

  const archiveAnalysisQuery = trpc.analysis.get.useQuery(
    {
      reportIds: archiveTargetReport ? [archiveTargetReport.id] : [],
      rideCodes: [],
    },
    { enabled: Boolean(archiveTargetReport) && activeTab === "archive" }
  );

  const archiveSummaryQuery = trpc.downtimeSummary.getByDate.useQuery(
    { dateKey: archiveSelectedDate },
    { enabled: Boolean(archiveSelectedDate) && activeTab === "archive" }
  );

  const datesWithDataQuery = trpc.downtimeSummary.listDatesWithData.useQuery();
  const datesWithData = datesWithDataQuery.data || [];

  // Initialize and merge incident state
  useEffect(() => {
    if (!analysisQuery.data) return;

    // Requirement: strictly technical downtime only (filter out inclement weather and fire alarms)
    const technicalIncidents = analysisQuery.data.incidentLogs.filter(
      l => l.kind === "technical" && l.rideCode
    );

    const savedState = summaryQuery.data;
    if (savedState?.summary) {
      if (savedState.summary.amExecutive) setAmExecutive(savedState.summary.amExecutive);
      if (savedState.summary.pmExecutive) setPmExecutive(savedState.summary.pmExecutive);
      if ((savedState.summary as any).zoneBAmExecutive) setZoneBAmExecutive((savedState.summary as any).zoneBAmExecutive);
      if ((savedState.summary as any).zoneBPmExecutive) setZoneBPmExecutive((savedState.summary as any).zoneBPmExecutive);
    }

    const savedMap = new Map((savedState?.entries || []).map(e => [e.incidentKey, e]));

    const merged: SummaryIncident[] = technicalIncidents.map((item, index) => {
      const key = item.id || `inc-${item.dateKey}-${item.rideCode}-${index}`;
      const saved = savedMap.get(key);
      const times = (item.timeRange || "").split("-");
      const startTime = times[0] || "";
      const endTime = times[1] || "";
      // Requirement: timing must be accurate. Hours must be converted to minutes, or taken from Analysis Studio duration
      const duration = parseDurationMinutes(item.durationLabel, startTime, endTime);
      const shift = parseShift(startTime);
      const defaultZone = ZONE_ASSIGNMENTS[item.rideCode || ""] || "Zone A";

      return {
        incidentKey: key,
        zone: saved?.zone ? normalizeZone(saved.zone) : defaultZone,
        rideCode: item.rideCode || "",
        attraction: item.attraction || item.rideCode || "",
        description: item.description,
        downtimeStart: startTime,
        downtimeEnd: endTime,
        durationMinutes: duration,
        shift,
        rootCause: saved?.rootCause ?? "",
        correctiveAction: saved?.correctiveAction ?? "",
        preventiveAction: saved?.preventiveAction ?? "",
        partsReplaced: saved?.partsReplaced ?? "N/A",
        followUpAction: saved?.followUpAction ?? "N/A",
        anrNo: saved?.anrNo ?? "N/A",
        supportInfo: saved?.supportInfo ?? "",
        supportPhotoUrl: saved?.supportPhotoUrl ?? null,
        supportPhotoName: saved?.supportPhotoName ?? null,
        status: "Monitoring",
      };
    }).sort((left, right) => left.downtimeStart.localeCompare(right.downtimeStart) || left.rideCode.localeCompare(right.rideCode));

    setIncidents(merged);

    // Default: all technical incidents checked for export
    setSelectedKeysForExport(prev => {
      if (prev.size === 0) {
        return new Set(merged.map(m => m.incidentKey));
      }
      return prev;
    });

    if (merged.length > 0 && !selectedIncidentKey) {
      setSelectedIncidentKey(merged[0].incidentKey);
    }
  }, [analysisQuery.data, summaryQuery.data]);

  const filteredIncidents = useMemo(() => {
    if (zoneFilter === "ALL") return incidents;
    return incidents.filter(i => i.zone === zoneFilter);
  }, [incidents, zoneFilter]);

  const activeIncident = useMemo(() => {
    return incidents.find(i => i.incidentKey === selectedIncidentKey) || filteredIncidents[0] || null;
  }, [incidents, filteredIncidents, selectedIncidentKey]);

  const updateActiveField = (field: keyof SummaryIncident, value: any) => {
    if (!activeIncident) return;
    setIncidents(curr =>
      curr.map(item =>
        item.incidentKey === activeIncident.incidentKey ? { ...item, [field]: value } : item
      )
    );
  };

  const toggleIncidentExport = (key: string) => {
    setSelectedKeysForExport(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllExport = () => {
    setSelectedKeysForExport(new Set(incidents.map(i => i.incidentKey)));
  };

  const deselectAllExport = () => {
    setSelectedKeysForExport(new Set());
  };

  const saveMutation = trpc.downtimeSummary.save.useMutation({
    onSuccess: () => {
      toast.success("Downtime summary saved to website memory.");
      utils.downtimeSummary.getByDate.invalidate({ dateKey });
      utils.downtimeSummary.listDatesWithData.invalidate();
    },
    onError: err => {
      toast.error(err.message || "Failed to save downtime summary.");
    },
  });

  const generateDocxMutation = trpc.downtimeSummary.generateDocx.useMutation({
    onSuccess: data => {
      toast.success("DOCX generated successfully. Download started.");
      utils.downtimeSummary.getByDate.invalidate({ dateKey });
      utils.downtimeSummary.listDatesWithData.invalidate();
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    onError: err => {
      toast.error(err.message || "Failed to generate summary report.");
    },
  });

  const importMutation = trpc.downtimeSummary.recordImport.useMutation({
    onSuccess: () => {
      toast.success("File imported and text extracted into summary details.");
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      utils.downtimeSummary.listDatesWithData.invalidate();
    },
    onError: err => {
      toast.error(err.message || "Failed to record import.");
    },
  });

  const handleSave = () => {
    if (!currentSavedReport) {
      toast.error("Source report ID is not available.");
      return;
    }
    saveMutation.mutate({
      reportDate: dateKey,
      sourceReportId: currentSavedReport.id,
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      entries: incidents,
    });
  };

  const handleDownload = () => {
    if (!currentSavedReport) {
      toast.error("Source report ID is not available.");
      return;
    }
    const exportEntries = incidents.filter(i => selectedKeysForExport.has(i.incidentKey));
    if (!exportEntries.length) {
      toast.error("Please tick at least one downtime event to export.");
      return;
    }
    generateDocxMutation.mutate({
      reportDate: dateKey,
      sourceReportId: currentSavedReport.id,
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      entries: exportEntries,
    });
  };

  const processPhotoFile = async (file: File) => {
    if (!activeIncident) return;
    setIsUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/downtime/summary-upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Photo upload failed.");
      updateActiveField("supportPhotoUrl", result.fileUrl);
      updateActiveField("supportPhotoName", result.fileName);
      toast.success(`Photo attached: ${result.fileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo.");
    } finally {
      setIsUploadingPhoto(false);
      setIsPhotoDragging(false);
    }
  };

  const processArchiveFile = async (file: File) => {
    if (!archiveSelectedDate) return;
    setIsImportingFile(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/downtime/summary-upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Archive upload failed.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      importMutation.mutate({
        reportDate: archiveSelectedDate,
        fileName: result.fileName,
        fileUrl: result.fileUrl,
        fileType: ext,
        extractedText: result.extractedText || null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload archive file.");
    } finally {
      setIsImportingFile(false);
      setIsArchiveDragging(false);
    }
  };

  // Determine Executive In Charge for active incident based on Zone A vs Zone B and Shift
  const activeShift = activeIncident?.shift || "AM";
  const activeZone = activeIncident?.zone || "Zone A";
  const activeExecutiveInCharge = useMemo(() => {
    if (activeZone === "Zone B") {
      if (activeShift === "PM") {
        return zoneBPmExecutive ? `PM – ${zoneBPmExecutive}` : (pmExecutive ? `PM – ${pmExecutive}` : "PM – (Unassigned)");
      }
      return zoneBAmExecutive ? `AM – ${zoneBAmExecutive}` : (amExecutive ? `AM – ${amExecutive}` : "AM – (Unassigned)");
    }
    // Zone A (default)
    if (activeShift === "PM") {
      return pmExecutive ? `PM – ${pmExecutive}` : "PM – (Unassigned)";
    }
    return amExecutive ? `AM – ${amExecutive}` : "AM – (Unassigned)";
  }, [activeZone, activeShift, amExecutive, pmExecutive, zoneBAmExecutive, zoneBPmExecutive]);

  // Build archive table preview rows (from saved summary entries or fallback raw technical logs!)
  const archiveTableRows = useMemo(() => {
    const savedEntries = archiveSummaryQuery.data?.entries;
    if (savedEntries && savedEntries.length > 0) {
      return savedEntries.map(e => ({
        id: String(e.id),
        zone: normalizeZone(e.zone),
        rideCode: e.rideCode,
        description: e.description,
        timeRange: `${e.downtimeStart}–${e.downtimeEnd}`,
        duration: `${e.durationMinutes}m`,
        rootCause: e.rootCause || "—",
        correctiveAction: e.correctiveAction || "—",
        preventiveAction: e.preventiveAction || "—",
        isSaved: true,
      }));
    }
    // Fallback: preview raw technical incidents for this date even before manual save!
    const techLogs = archiveAnalysisQuery.data?.incidentLogs.filter(l => l.kind === "technical" && l.rideCode) || [];
    return techLogs.map((l, idx) => {
      const times = (l.timeRange || "").split("-");
      const duration = parseDurationMinutes(l.durationLabel, times[0], times[1]);
      const defaultZone = ZONE_ASSIGNMENTS[l.rideCode || ""] || "Zone A";
      return {
        id: `raw-${idx}-${l.rideCode}`,
        zone: defaultZone,
        rideCode: l.rideCode || "",
        description: l.description,
        timeRange: l.timeRange || "—",
        duration: `${duration}m`,
        rootCause: "— (Unsaved raw log)",
        correctiveAction: "—",
        preventiveAction: "—",
        isSaved: false,
      };
    });
  }, [archiveSummaryQuery.data?.entries, archiveAnalysisQuery.data?.incidentLogs]);

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] pb-28 text-slate-900">
        <header className="px-1 pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/analysis">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-[#1e4ca1] hover:bg-blue-50">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Analysis Studio
                </Button>
              </Link>
              <Badge className="bg-indigo-100 text-[#1e4ca1] hover:bg-indigo-100">
                Daily Downtime Summary
              </Badge>
              {dateKey && (
                <Badge variant="outline" className="border-indigo-300 font-mono text-indigo-900">
                  {formatDisplayDate(dateKey)}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#162b5b]">
              Downtime Summary Workspace
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Technical incident summary for {formatDisplayDate(dateKey)}. Weather & fire alarms filtered out.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-200/80 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                  activeTab === "editor"
                    ? "bg-[#1e4ca1] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Summary Form
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("archive")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                  activeTab === "archive"
                    ? "bg-[#1e4ca1] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Memory & Archive
              </button>
            </div>
          </div>
        </header>

        {activeTab === "editor" && (
          <div className="mt-6 space-y-6">
            <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-[#1e4ca1]" />
                    <span className="text-sm font-extrabold text-[#162b5b]">Executives In Charge (Zone A & Zone B)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                      className="h-9 gap-1.5 border-indigo-200 text-[#1e4ca1] hover:bg-indigo-50 font-bold"
                    >
                      {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Progress
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDownload}
                      disabled={generateDocxMutation.isPending}
                      className="h-9 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold shadow-sm"
                    >
                      {generateDocxMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download Summary Report (DOCX) ({selectedKeysForExport.size} ticked)
                    </Button>
                  </div>
                </div>

                {/* Two rows of Executive In Charge: Row 1 = Zone A, Row 2 = Zone B */}
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className="bg-blue-100 text-[#1e4ca1] font-bold text-[10px]">Zone A Executive</Badge>
                      <span className="text-[11px] text-slate-500">Applies to Zone A technical incidents</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Zone A – AM Executive (Before 2:00 PM)
                        </label>
                        <Input
                          placeholder="e.g. Firdaus, Adam"
                          value={amExecutive}
                          onChange={e => setAmExecutive(e.target.value)}
                          className="mt-1 h-9 bg-[#fbfdff]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Zone A – PM Executive (2:00 PM onwards)
                        </label>
                        <Input
                          placeholder="e.g. Yik Seng"
                          value={pmExecutive}
                          onChange={e => setPmExecutive(e.target.value)}
                          className="mt-1 h-9 bg-[#fbfdff]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className="bg-amber-100 text-amber-900 font-bold text-[10px]">Zone B Executive</Badge>
                      <span className="text-[11px] text-slate-500">Applies to Zone B technical incidents (falls back to Zone A if blank)</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Zone B – AM Executive (Before 2:00 PM)
                        </label>
                        <Input
                          placeholder="e.g. Zone B AM Officer"
                          value={zoneBAmExecutive}
                          onChange={e => setZoneBAmExecutive(e.target.value)}
                          className="mt-1 h-9 bg-[#fbfdff]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Zone B – PM Executive (2:00 PM onwards)
                        </label>
                        <Input
                          placeholder="e.g. Zone B PM Officer"
                          value={zoneBPmExecutive}
                          onChange={e => setZoneBPmExecutive(e.target.value)}
                          className="mt-1 h-9 bg-[#fbfdff]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[330px_1fr]">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm h-fit">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#162b5b]">Today&apos;s Downtime</h3>
                      <p className="text-[11px] text-slate-500">
                        {filteredIncidents.length} technical events • {selectedKeysForExport.size} ticked for export
                      </p>
                    </div>
                    <Layers className="h-4 w-4 text-[#1e4ca1]" />
                  </div>

                  <div className="flex items-center justify-between gap-2 border-y border-slate-100 py-1.5 text-[11px]">
                    <span className="font-semibold text-slate-600">Export Selection:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllExport}
                        className="text-[#1e4ca1] font-bold hover:underline"
                      >
                        Tick All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllExport}
                        className="text-slate-500 hover:text-rose-600 hover:underline"
                      >
                        Untick All
                      </button>
                    </div>
                  </div>

                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
                    {(["ALL", "Zone A", "Zone B"] as const).map(z => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZoneFilter(z)}
                        className={`flex-1 rounded-md py-1 text-[11px] transition-all ${
                          zoneFilter === z
                            ? "bg-white text-[#1e4ca1] shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {z}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
                    {filteredIncidents.map(inc => {
                      const isSelected = inc.incidentKey === activeIncident?.incidentKey;
                      const isTicked = selectedKeysForExport.has(inc.incidentKey);

                      return (
                        <div
                          key={inc.incidentKey}
                          onClick={() => setSelectedIncidentKey(inc.incidentKey)}
                          className={`group relative flex items-start gap-2.5 rounded-xl border p-3 transition-all cursor-pointer ${
                            isSelected
                              ? "border-[#1e4ca1] bg-blue-50/70 ring-1 ring-[#1e4ca1]/40"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div
                            className="pt-0.5 shrink-0"
                            onClick={e => {
                              e.stopPropagation();
                              toggleIncidentExport(inc.incidentKey);
                            }}
                          >
                            <Checkbox
                              checked={isTicked}
                              onCheckedChange={() => toggleIncidentExport(inc.incidentKey)}
                              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs font-extrabold text-[#1e4ca1]">
                                {inc.rideCode}
                              </span>
                              <Badge variant="outline" className="text-[9px] border-slate-300">
                                {inc.zone} • {inc.shift}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-slate-800 line-clamp-1">
                              {inc.description}
                            </p>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                              <span>
                                {inc.downtimeStart}–{inc.downtimeEnd}
                              </span>
                              <span className="font-bold text-rose-700">{inc.durationMinutes} min</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {activeIncident ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          Active Incident Form
                        </span>
                        <h2 className="text-xl font-extrabold text-[#162b5b]">
                          {activeIncident.rideCode} — {activeIncident.attraction}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-100 text-[#1e4ca1]">
                          Assigned: {activeIncident.zone}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-900 font-bold">
                          Shift: {activeIncident.shift} ({activeExecutiveInCharge})
                        </Badge>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-50/50">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-slate-300">
                            <td className="w-36 bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Date
                            </td>
                            <td className="p-2.5 border-r border-slate-300 font-semibold">
                              {formatDisplayDate(dateKey)}
                            </td>
                            <td className="w-36 bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Ride/Attraction
                            </td>
                            <td className="p-2.5 font-bold text-[#162b5b]">
                              {activeIncident.rideCode}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Executive In Charge
                            </td>
                            <td colSpan={3} className="p-2.5 font-extrabold text-[#1e4ca1]">
                              {activeExecutiveInCharge}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Assigned Care Zone
                            </td>
                            <td colSpan={3} className="p-2.5">
                              <select
                                value={activeIncident.zone}
                                onChange={e => updateActiveField("zone", e.target.value as "Zone A" | "Zone B")}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="Zone A">Zone A</option>
                                <option value="Zone B">Zone B</option>
                              </select>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Downtime Description
                            </td>
                            <td colSpan={3} className="p-2.5 font-mono text-slate-800 bg-white">
                              {activeIncident.description}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Time Details
                            </td>
                            <td colSpan={3} className="p-2.5 font-semibold text-slate-800">
                              Time Down: <strong>{activeIncident.downtimeStart}</strong> &nbsp;|&nbsp; Time Up: <strong>{activeIncident.downtimeEnd}</strong> &nbsp;|&nbsp; Duration: <strong className="text-rose-700">{activeIncident.durationMinutes} min</strong>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Root Cause(s) *
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Textarea
                                placeholder="Describe the verified root cause..."
                                value={activeIncident.rootCause || ""}
                                onChange={e => updateActiveField("rootCause", e.target.value)}
                                className="min-h-[70px] text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Corrective Action *
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Textarea
                                placeholder="Enter corrective actions taken..."
                                value={activeIncident.correctiveAction || ""}
                                onChange={e => updateActiveField("correctiveAction", e.target.value)}
                                className="min-h-[70px] text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Preventive Action *
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Textarea
                                placeholder="Enter preventive maintenance or inspection follow-up..."
                                value={activeIncident.preventiveAction || ""}
                                onChange={e => updateActiveField("preventiveAction", e.target.value)}
                                className="min-h-[60px] text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Part(s) Replaced
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Input
                                placeholder="e.g. N/A or Fuse 24V"
                                value={activeIncident.partsReplaced || ""}
                                onChange={e => updateActiveField("partsReplaced", e.target.value)}
                                className="h-8 text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Follow-Up Action
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Input
                                placeholder="e.g. N/A or Dark day valve inspection"
                                value={activeIncident.followUpAction || ""}
                                onChange={e => updateActiveField("followUpAction", e.target.value)}
                                className="h-8 text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              ANR No.
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Input
                                placeholder="e.g. N/A"
                                value={activeIncident.anrNo || ""}
                                onChange={e => updateActiveField("anrNo", e.target.value)}
                                className="h-8 text-xs"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Other Supporting Info
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white space-y-3">
                              <Textarea
                                placeholder="Notes, checklist details, or photo description..."
                                value={activeIncident.supportInfo || ""}
                                onChange={e => updateActiveField("supportInfo", e.target.value)}
                                className="min-h-[50px] text-xs"
                              />

                              {/* Requirement: Drag and drop support info photo dropzone */}
                              <div
                                onDragOver={e => {
                                  e.preventDefault();
                                  setIsPhotoDragging(true);
                                }}
                                onDragLeave={() => setIsPhotoDragging(false)}
                                onDrop={e => {
                                  e.preventDefault();
                                  setIsPhotoDragging(false);
                                  const file = e.dataTransfer.files?.[0];
                                  if (file) processPhotoFile(file);
                                }}
                                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-all ${
                                  isPhotoDragging
                                    ? "border-[#1e4ca1] bg-blue-50"
                                    : "border-slate-300 bg-slate-50/60 hover:bg-slate-50"
                                }`}
                              >
                                <input
                                  ref={photoInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) processPhotoFile(file);
                                  }}
                                  className="hidden"
                                />

                                <div className="flex flex-wrap items-center justify-center gap-2">
                                  <span className="text-xs text-slate-600 font-medium">
                                    Drag and drop photo here, or
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={isUploadingPhoto}
                                    className="h-7 gap-1.5 border-slate-300 text-xs font-bold text-[#1e4ca1] hover:bg-blue-50"
                                  >
                                    <ImageIcon className="h-3.5 w-3.5" />
                                    <span>{isUploadingPhoto ? "Attaching Photo..." : "Upload Photo"}</span>
                                  </Button>
                                </div>

                                {activeIncident.supportPhotoName && (
                                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800 border border-emerald-200">
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="font-semibold">{activeIncident.supportPhotoName}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateActiveField("supportPhotoUrl", null);
                                        updateActiveField("supportPhotoName", null);
                                      }}
                                      className="ml-2 text-slate-400 hover:text-rose-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Status
                            </td>
                            <td colSpan={3} className="p-2.5 font-bold text-emerald-800 bg-emerald-50/40">
                              ☑ Monitoring &nbsp;&nbsp;(Per operational requirement, status is maintained on Monitoring)
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  Select a downtime event from the sidebar to complete its summary form.
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "archive" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
            <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#162b5b]">Summary Calendar Memory</h3>
                    <p className="text-[11px] text-slate-500">Dates with saved summaries have blue indicators</p>
                  </div>
                  <CalendarDays className="h-4 w-4 text-[#1e4ca1]" />
                </div>

                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={archiveSelectedDate ? new Date(`${archiveSelectedDate}T12:00:00`) : undefined}
                    onDayClick={day => {
                      const y = day.getFullYear();
                      const m = String(day.getMonth() + 1).padStart(2, "0");
                      const d = String(day.getDate()).padStart(2, "0");
                      setArchiveSelectedDate(`${y}-${m}-${d}`);
                    }}
                    weekStartsOn={1}
                    modifiers={{
                      savedLog: datesWithData.map(d => new Date(`${d}T12:00:00`)),
                    }}
                    className="rounded-xl bg-[#f8faff] p-2"
                  />
                </div>

                {/* Requirement: Drag and drop feature for DOCX/PDF imports */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="block text-xs font-bold text-slate-700">Import Past Report (PDF/Word)</span>
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      setIsArchiveDragging(true);
                    }}
                    onDragLeave={() => setIsArchiveDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsArchiveDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) processArchiveFile(file);
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                      isArchiveDragging
                        ? "border-[#1e4ca1] bg-indigo-50/90"
                        : "border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50/70"
                    }`}
                  >
                    <input
                      ref={archiveInputRef}
                      type="file"
                      accept=".docx,.doc,.pdf"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) processArchiveFile(file);
                      }}
                      className="hidden"
                    />

                    <FileUp className="h-5 w-5 text-[#1e4ca1] mb-1" />
                    <span className="text-xs font-medium text-slate-700">
                      Drag and drop DOCX / PDF report here
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => archiveInputRef.current?.click()}
                      disabled={isImportingFile}
                      className="mt-2 h-7 border-indigo-300 bg-white text-xs font-bold text-[#1e4ca1] hover:bg-indigo-50"
                    >
                      {isImportingFile ? "Importing & Extracting..." : "Choose File"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          Archive View
                        </span>
                        {archiveSummaryQuery.data?.summary ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Saved Web Summary</Badge>
                        ) : archiveTableRows.length > 0 ? (
                          <Badge variant="outline" className="border-blue-300 text-[#1e4ca1] text-[10px]">Technical Log Preview</Badge>
                        ) : null}
                      </div>
                      <h2 className="text-xl font-extrabold text-[#162b5b]">
                        Summary Details for {formatDisplayDate(archiveSelectedDate)}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/summary?date=${archiveSelectedDate}`}>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-bold border-indigo-200 text-[#1e4ca1]">
                          Open In Editor
                        </Button>
                      </Link>
                      {archiveSummaryQuery.data?.summary?.generatedFileUrl && (
                        <a
                          href={archiveSummaryQuery.data.summary.generatedFileUrl}
                          download={archiveSummaryQuery.data.summary.generatedFileName || "Summary.docx"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold h-8 gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            Download Generated DOCX
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>

                  {archiveTableRows.length ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <span>Zone A AM: <strong>{archiveSummaryQuery.data?.summary?.amExecutive || "—"}</strong></span>
                        <span>Zone A PM: <strong>{archiveSummaryQuery.data?.summary?.pmExecutive || "—"}</strong></span>
                        <span>Zone B AM: <strong>{(archiveSummaryQuery.data?.summary as any)?.zoneBAmExecutive || "—"}</strong></span>
                        <span>Zone B PM: <strong>{(archiveSummaryQuery.data?.summary as any)?.zoneBPmExecutive || "—"}</strong></span>
                      </div>

                      {/* Requirement: Display up to 3 lines, with scrollability inside rows for long text */}
                      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 uppercase font-extrabold text-[10px]">
                            <tr>
                              <th className="p-2.5 text-left w-20">Zone</th>
                              <th className="p-2.5 text-left w-20">Ride</th>
                              <th className="p-2.5 text-left min-w-[200px]">Description</th>
                              <th className="p-2.5 text-left w-24">Time</th>
                              <th className="p-2.5 text-left w-20">Duration</th>
                              <th className="p-2.5 text-left min-w-[220px]">Root Cause</th>
                              <th className="p-2.5 text-left min-w-[220px]">Corrective Action</th>
                              <th className="p-2.5 text-left min-w-[200px]">Preventive</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {archiveTableRows.map(row => (
                              <tr key={row.id} className="hover:bg-slate-50/80 align-top">
                                <td className="p-2.5 font-bold text-[#1e4ca1]">{row.zone}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{row.rideCode}</td>
                                <td className="p-2.5">
                                  <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                    {row.description}
                                  </div>
                                </td>
                                <td className="p-2.5 whitespace-nowrap font-medium text-slate-600">{row.timeRange}</td>
                                <td className="p-2.5 font-bold text-rose-700 whitespace-nowrap">{row.duration}</td>
                                <td className="p-2.5">
                                  <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                    {row.rootCause}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                    {row.correctiveAction}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                    {row.preventiveAction}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No technical downtime or summary records found for {formatDisplayDate(archiveSelectedDate)}.
                    </div>
                  )}

                  {/* Requirement: When a new import is done, read and display the text written in the uploaded document */}
                  {archiveSummaryQuery.data?.imports?.length ? (
                    <div className="border-t border-slate-200 pt-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-extrabold text-[#162b5b]">
                          Imported Report Documents &amp; Extracted Details
                        </h4>
                        <Badge variant="outline" className="text-[10px]">
                          {archiveSummaryQuery.data.imports.length} document(s)
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {archiveSummaryQuery.data.imports.map(item => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-[#1e4ca1]" />
                                <span className="font-bold text-xs text-slate-800">{item.fileName}</span>
                                <Badge className="text-[9px] bg-indigo-50 text-[#1e4ca1] uppercase font-mono">
                                  {item.fileType}
                                </Badge>
                              </div>
                              <a
                                href={item.fileUrl}
                                download={item.fileName}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#1e4ca1] hover:underline"
                              >
                                <Download className="h-3 w-3" />
                                <span>Download File</span>
                              </a>
                            </div>

                            {item.extractedText ? (
                              <div>
                                <span className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Extracted Document Text:
                                </span>
                                <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap select-text">
                                  {item.extractedText}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">
                                Document file stored in archive. Text extraction was not available for this binary format.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
