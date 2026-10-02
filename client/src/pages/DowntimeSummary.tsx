import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
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
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

type SummaryTab = "editor" | "archive";

type SummaryIncident = {
  incidentKey: string;
  zone: string;
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

const ZONE_ASSIGNMENTS: Record<string, string> = {
  BWZ: "Zone 1",
  RTR: "Zone 1",
  ESD: "Zone 1",
  IDD: "Zone 1",
  NTM: "Zone 1",
  PTA: "Zone 1",
  POTA: "Zone 1",
  "BCT (EV)": "Zone 1",
  "BCT (RC)": "Zone 1",
  "BCT (UZ)": "Zone 1",
  "BCT (ZC)": "Zone 1",
  AFP: "Zone 1",
  TTC: "Zone 1",
  MFZ: "Zone 2",
  ACR: "Zone 2",
  SRS: "Zone 2",
  ETI: "Zone 2",
  EHF: "Zone 2",
  VTM: "Zone 2",
  BSC: "Zone 2",
  RCC: "Zone 2",
  SAG: "Zone 2",
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

export default function DowntimeSummary() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const dateKey = searchParams.get("date") || "";

  const [activeTab, setActiveTab] = useState<SummaryTab>("editor");
  const [selectedIncidentKey, setSelectedIncidentKey] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<"ALL" | "Zone 1" | "Zone 2">("ALL");
  const [amExecutive, setAmExecutive] = useState("");
  const [pmExecutive, setPmExecutive] = useState("");
  const [incidents, setIncidents] = useState<SummaryIncident[]>([]);
  const [archiveSelectedDate, setArchiveSelectedDate] = useState<string>(dateKey);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);

  const utils = trpc.useUtils();

  const { data: savedReports = [] } = trpc.savedReports.list.useQuery();
  const currentSavedReport = useMemo(() => {
    return savedReports.find(report => report.reportDate === dateKey);
  }, [savedReports, dateKey]);

  const analysisQuery = trpc.analysis.get.useQuery(
    {
      reportIds: currentSavedReport ? [currentSavedReport.id] : [],
      rideCodes: [],
    },
    { enabled: Boolean(currentSavedReport) }
  );

  const summaryQuery = trpc.downtimeSummary.getByDate.useQuery(
    { dateKey },
    { enabled: Boolean(dateKey) }
  );

  const archiveSummaryQuery = trpc.downtimeSummary.getByDate.useQuery(
    { dateKey: archiveSelectedDate },
    { enabled: Boolean(archiveSelectedDate) && activeTab === "archive" }
  );

  const datesWithDataQuery = trpc.downtimeSummary.listDatesWithData.useQuery();
  const datesWithData = datesWithDataQuery.data || [];

  useEffect(() => {
    if (!analysisQuery.data) return;
    const reportableIncidents = analysisQuery.data.incidentLogs.filter(
      l => (l.kind === "technical" || l.kind === "weather" || l.kind === "fireAlarm") && l.rideCode
    );

    const savedState = summaryQuery.data;
    if (savedState?.summary) {
      if (savedState.summary.amExecutive) setAmExecutive(savedState.summary.amExecutive);
      if (savedState.summary.pmExecutive) setPmExecutive(savedState.summary.pmExecutive);
    }

    const savedMap = new Map((savedState?.entries || []).map(e => [e.incidentKey, e]));

    const merged: SummaryIncident[] = reportableIncidents.map((item, index) => {
      const key = item.id || `inc-${item.dateKey}-${item.rideCode}-${index}`;
      const saved = savedMap.get(key);
      const times = (item.timeRange || "").split("-");
      const startTime = times[0] || "";
      const endTime = times[1] || "";
      const duration = parseInt((item.durationLabel || "").replace(/[^0-9]/g, ""), 10) || 0;
      const shift = parseShift(startTime);
      const defaultZone = ZONE_ASSIGNMENTS[item.rideCode || ""] || "Zone 1";

      return {
        incidentKey: key,
        zone: saved?.zone || defaultZone,
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
      toast.success("File imported and archived.");
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
      entries: incidents,
    });
  };

  const handleDownload = () => {
    if (!currentSavedReport) {
      toast.error("Source report ID is not available.");
      return;
    }
    generateDocxMutation.mutate({
      reportDate: dateKey,
      sourceReportId: currentSavedReport.id,
      amExecutive,
      pmExecutive,
      entries: incidents,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeIncident) return;
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
    }
  };

  const handleArchiveFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !archiveSelectedDate) return;
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
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload archive file.");
    } finally {
      setIsImportingFile(false);
    }
  };

  const activeShift = activeIncident?.shift || "AM";
  const activeExecutiveInCharge =
    activeShift === "PM"
      ? pmExecutive ? `PM – ${pmExecutive}` : "PM – (Unassigned)"
      : amExecutive ? `AM – ${amExecutive}` : "AM – (Unassigned)";

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
              Complete the executive shift report for {formatDisplayDate(dateKey)}. Pre-filled from the selected day&apos;s incident records.
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
                    <span className="text-sm font-extrabold text-[#162b5b]">Executives In Charge</span>
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
                      Download Summary Report (DOCX)
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      AM Executive (Before 2:00 PM)
                    </label>
                    <Input
                      placeholder="e.g. Firdaus, Adam"
                      value={amExecutive}
                      onChange={e => setAmExecutive(e.target.value)}
                      className="mt-1 h-9 bg-[#fbfdff]"
                    />
                    <span className="text-[10px] text-slate-500">Auto-applies to incidents starting before 14:00H</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      PM Executive (2:00 PM onwards)
                    </label>
                    <Input
                      placeholder="e.g. Yik Seng"
                      value={pmExecutive}
                      onChange={e => setPmExecutive(e.target.value)}
                      className="mt-1 h-9 bg-[#fbfdff]"
                    />
                    <span className="text-[10px] text-slate-500">Auto-applies to incidents starting at or after 14:00H</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm h-fit">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#162b5b]">Today&apos;s Downtime</h3>
                      <p className="text-[11px] text-slate-500">{filteredIncidents.length} recorded events</p>
                    </div>
                    <Layers className="h-4 w-4 text-[#1e4ca1]" />
                  </div>

                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
                    {(["ALL", "Zone 1", "Zone 2"] as const).map(z => (
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

                  <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                    {filteredIncidents.map(inc => {
                      const isSelected = inc.incidentKey === activeIncident?.incidentKey;
                      return (
                        <button
                          key={inc.incidentKey}
                          type="button"
                          onClick={() => setSelectedIncidentKey(inc.incidentKey)}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? "border-[#1e4ca1] bg-blue-50/70 ring-1 ring-[#1e4ca1]/40"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
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
                        </button>
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
                                onChange={e => updateActiveField("zone", e.target.value)}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="Zone 1">Zone 1</option>
                                <option value="Zone 2">Zone 2</option>
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
                            <td colSpan={3} className="p-2.5 bg-white space-y-2">
                              <Textarea
                                placeholder="Notes, checklist details, or photo description..."
                                value={activeIncident.supportInfo || ""}
                                onChange={e => updateActiveField("supportInfo", e.target.value)}
                                className="min-h-[50px] text-xs"
                              />
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                                  <ImageIcon className="h-3.5 w-3.5 text-[#1e4ca1]" />
                                  <span>{isUploadingPhoto ? "Attaching Photo..." : "Upload Photo"}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    className="hidden"
                                    disabled={isUploadingPhoto}
                                  />
                                </label>
                                {activeIncident.supportPhotoName && (
                                  <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                                    <Check className="h-3 w-3" />
                                    <span>{activeIncident.supportPhotoName}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateActiveField("supportPhotoUrl", null);
                                        updateActiveField("supportPhotoName", null);
                                      }}
                                      className="ml-1 text-slate-400 hover:text-rose-600"
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

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="block text-xs font-bold text-slate-700">Import Past Report (PDF/Word)</span>
                  <label className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3 text-xs font-bold text-[#1e4ca1] hover:bg-indigo-50 cursor-pointer">
                    <FileUp className="h-4 w-4" />
                    <span>{isImportingFile ? "Importing file..." : "Import DOCX / PDF for this date"}</span>
                    <input
                      type="file"
                      accept=".docx,.doc,.pdf"
                      onChange={handleArchiveFileUpload}
                      className="hidden"
                      disabled={isImportingFile}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        Archive View
                      </span>
                      <h2 className="text-xl font-extrabold text-[#162b5b]">
                        Summary Details for {formatDisplayDate(archiveSelectedDate)}
                      </h2>
                    </div>
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

                  {archiveSummaryQuery.data?.entries?.length ? (
                    <div className="space-y-4">
                      <div className="flex gap-4 text-xs font-semibold text-slate-700">
                        <span>AM Executive: <strong>{archiveSummaryQuery.data.summary.amExecutive || "N/A"}</strong></span>
                        <span>PM Executive: <strong>{archiveSummaryQuery.data.summary.pmExecutive || "N/A"}</strong></span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-300">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 uppercase font-extrabold text-[10px]">
                            <tr>
                              <th className="p-2.5 text-left">Zone</th>
                              <th className="p-2.5 text-left">Ride</th>
                              <th className="p-2.5 text-left">Description</th>
                              <th className="p-2.5 text-left">Time</th>
                              <th className="p-2.5 text-left">Duration</th>
                              <th className="p-2.5 text-left">Root Cause</th>
                              <th className="p-2.5 text-left">Corrective Action</th>
                              <th className="p-2.5 text-left">Preventive</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {archiveSummaryQuery.data.entries.map(e => (
                              <tr key={e.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-bold text-[#1e4ca1]">{e.zone}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{e.rideCode}</td>
                                <td className="p-2.5 max-w-[200px] truncate">{e.description}</td>
                                <td className="p-2.5 whitespace-nowrap">{e.downtimeStart}–{e.downtimeEnd}</td>
                                <td className="p-2.5 font-bold text-rose-700">{e.durationMinutes}m</td>
                                <td className="p-2.5 max-w-[150px] truncate">{e.rootCause || "—"}</td>
                                <td className="p-2.5 max-w-[150px] truncate">{e.correctiveAction || "—"}</td>
                                <td className="p-2.5 max-w-[150px] truncate">{e.preventiveAction || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No web summary records saved for this date.
                    </div>
                  )}

                  {archiveSummaryQuery.data?.imports?.length ? (
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700">Archived Imported Files</h4>
                      <div className="space-y-1.5">
                        {archiveSummaryQuery.data.imports.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs"
                          >
                            <span className="font-semibold text-slate-800">{item.fileName}</span>
                            <a
                              href={item.fileUrl}
                              download={item.fileName}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[#1e4ca1] hover:underline"
                            >
                              Download File
                            </a>
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
