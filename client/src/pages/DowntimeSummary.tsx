import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Download,
  Edit2,
  FileSpreadsheet,
  FileText,
  FileUp,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getSummaryCompletion } from "@/lib/summaryCompletion";
import { resolveSummarySourceReportId, shouldUsePersistedSummary } from "@/lib/summaryPersistence";
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
  shift: "AM" | "PM";
  recurringDowntime?: "Yes" | "No";
  recurringDowntimeDays?: string;
  incident?: "Yes" | "No";
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  partsReplaced?: string;
  followUpAction?: string;
  anrNo?: string;
  supportInfo?: string;
  supportPhotoUrl?: string | null;
  supportPhotoName?: string | null;
  status: "Monitoring" | "Closed" | "Pending Parts";
};

const ZONE_ASSIGNMENTS: Record<string, "Zone A" | "Zone B"> = {
  // Zone A (12 attractions)
  BWZ: "Zone A",
  AFP: "Zone A",
  ESD: "Zone A",
  IDD: "Zone A",
  "BCT (EV)": "Zone A",
  "BCT (RC)": "Zone A",
  "BCT (UZ)": "Zone A",
  "BCT (ZC)": "Zone A",
  BCT: "Zone A", // alias fallback
  NTM: "Zone A",
  NATM: "Zone A", // alias fallback
  PTA: "Zone A",
  RTR: "Zone A",
  TTC: "Zone A",

  // Zone B (9 attractions)
  ACR: "Zone B",
  BSC: "Zone B",
  EHF: "Zone B",
  VTM: "Zone B",
  ETI: "Zone B",
  MFZ: "Zone B",
  RCC: "Zone B",
  SAG: "Zone B",
  SRS: "Zone B",
  ALH: "Zone B",
  BOG: "Zone B",
  CDL: "Zone B",
  MTR: "Zone B",
  ROB: "Zone B",
  IA3: "Zone A",
};

function normalizeZone(zone?: string | null): "Zone A" | "Zone B" {
  if (!zone) return "Zone A";
  const upper = zone.toUpperCase();
  if (upper.includes("B") || upper.includes("2")) return "Zone B";
  return "Zone A";
}

function parseShift(start?: string): "AM" | "PM" {
  if (!start) return "AM";
  const num = parseInt(start.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return "AM";
  return num >= 1400 ? "PM" : "AM";
}

function parseDurationMinutes(durationLabel?: string, start?: string, end?: string): number {
  if (durationLabel) {
    const hoursMatch = /(\d+)\s*(?:hour|hours|hr|hrs|h)\b/i.exec(durationLabel);
    const minsMatch = /(\d+)\s*(?:min|mins|minute|minutes|m)\b/i.exec(durationLabel);
    if (hoursMatch || minsMatch) {
      const h = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
      const m = minsMatch ? parseInt(minsMatch[1], 10) : 0;
      return h * 60 + m;
    }
  }
  if (start && end) {
    const s = parseInt(start.replace(/[^0-9]/g, ""), 10);
    const e = parseInt(end.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      const sH = Math.floor(s / 100);
      const sM = s % 100;
      const eH = Math.floor(e / 100);
      const eM = e % 100;
      return (eH * 60 + eM) - (sH * 60 + sM);
    }
  }
  return 0;
}

function formatDisplayDate(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[0];
    return `${day}/${month}/${year}`;
  }
  return dateKey;
}

function cleanDescriptionForMatching(text?: string | null): string {
  if (!text) return "";
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesImportedIncident(
  imported: { rideCode?: string; downtimeStart?: string; description?: string },
  candidate: { rideCode: string; downtimeStart?: string; description?: string }
): boolean {
  if (!imported.rideCode || candidate.rideCode !== imported.rideCode) {
    return false;
  }
  const cleanImportDesc = cleanDescriptionForMatching(imported.description);
  const cleanCandidateDesc = cleanDescriptionForMatching(candidate.description);
  const descMatches =
    cleanImportDesc &&
    cleanCandidateDesc &&
    (cleanImportDesc.includes(cleanCandidateDesc) || cleanCandidateDesc.includes(cleanImportDesc));

  if (imported.downtimeStart && candidate.downtimeStart) {
    const normImport = imported.downtimeStart.replace(/[^0-9]/g, "");
    const normCandidate = candidate.downtimeStart.replace(/[^0-9]/g, "");
    if (normImport && normCandidate && normImport === normCandidate) {
      return true;
    }
  }

  return Boolean(descMatches);
}

function handleNumberedListKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (val: string) => void
) {
  if (e.key === "Enter" && !e.shiftKey) {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = value.substring(0, start);
    const textAfter = value.substring(end);

    const lastNewline = textBefore.lastIndexOf("\n");
    const currentLine = lastNewline === -1 ? textBefore : textBefore.substring(lastNewline + 1);

    const match = /^(\s*)(\d+)\.\s*(.*)$/.exec(currentLine);
    if (match) {
      e.preventDefault();
      const indent = match[1];
      const num = parseInt(match[2], 10);
      const content = match[3];

      if (!content.trim()) {
        const withoutEmptyNum = textBefore.substring(0, textBefore.length - currentLine.length) + "\n" + textAfter;
        onChange(withoutEmptyNum);
        return;
      }

      const nextNum = num + 1;
      const insert = `\n${indent}${nextNum}. `;
      const newValue = textBefore + insert + textAfter;
      onChange(newValue);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      }, 0);
    }
  }
}

function renderFormattedActionText(raw?: string | null) {
  if (!raw) return "—";
  const lines = raw.split(/\r?\n/).flatMap(line => line.split(/(?=\b\d+\.\s+)/)).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "—";

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const match = /^(\d+\.)\s*(.*)$/.exec(line);
        if (match) {
          return (
            <p key={idx} className="leading-snug">
              <strong className="text-slate-900 font-bold">{match[1]}</strong>{" "}
              <span>{match[2]}</span>
            </p>
          );
        }
        return <p key={idx} className="leading-snug">{line}</p>;
      })}
    </div>
  );
}

export default function DowntimeSummary() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const dateKey = searchParams.get("date") || "";

  const [activeTab, setActiveTab] = useState<SummaryTab>("editor");
  const [selectedIncidentKey, setSelectedIncidentKey] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<"ALL" | "Zone A" | "Zone B">("ALL");
  const [isExecutivePanelOpen, setIsExecutivePanelOpen] = useState(false);
  const [amExecutive, setAmExecutive] = useState("");
  const [pmExecutive, setPmExecutive] = useState("");
  const [zoneBAmExecutive, setZoneBAmExecutive] = useState("");
  const [zoneBPmExecutive, setZoneBPmExecutive] = useState("");
  const [incidents, setIncidents] = useState<SummaryIncident[]>([]);
  const [selectedKeysForExport, setSelectedKeysForExport] = useState<Set<string>>(new Set());
  const [archiveSelectedDate, setArchiveSelectedDate] = useState<string>(dateKey || new Date().toISOString().slice(0, 10));
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isArchiveDragging, setIsArchiveDragging] = useState(false);

  // Calendar Memory Pop-up Modal State
  const [isCalendarDialogOpen, setIsCalendarDialogOpen] = useState(false);

  // Drafts State: zone filter, editing draft, delete modal
  const [draftZoneFilter, setDraftZoneFilter] = useState<"ALL" | "Zone A" | "Zone B">("ALL");
  const [isDraftFormOpen, setIsDraftFormOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [draftRideCode, setDraftRideCode] = useState("");
  const [draftZone, setDraftZone] = useState<"Zone A" | "Zone B">("Zone A");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftRootCause, setDraftRootCause] = useState("");
  const [draftCorrective, setDraftCorrective] = useState("");
  const [draftPreventive, setDraftPreventive] = useState("");
  const [draftFollowUp, setDraftFollowUp] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<{ id: number; rideCode: string } | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: savedReports = [] } = trpc.savedReports.list.useQuery();
  const currentSavedReport = useMemo(() => {
    return savedReports.find(report => report.reportDate === dateKey);
  }, [savedReports, dateKey]);

  // Database-backed summary data is the source of truth for a completed day.
  // Read it before analysis so an already-saved summary remains viewable even if
  // the source-log reference is refreshed or the analysis request is delayed.
  const summaryQuery = trpc.downtimeSummary.getByDate.useQuery(
    { dateKey },
    { enabled: Boolean(dateKey) }
  );
  const effectiveSourceReportId = resolveSummarySourceReportId(
    currentSavedReport?.id,
    summaryQuery.data?.summary?.sourceReportId
  );

  const analysisQuery = trpc.analysis.get.useQuery(
    {
      reportIds: effectiveSourceReportId ? [effectiveSourceReportId] : [],
      rideCodes: [],
    },
    { enabled: Boolean(effectiveSourceReportId) }
  );

  // Read target report for archive tab date
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

  const sessionDraftKey = useMemo(() => (dateKey ? `downtime-summary-draft-v42-${dateKey}` : ""), [dateKey]);
  const selectedKeysSourceRef = useRef<string>("");

  useEffect(() => {
    const savedState = summaryQuery.data;
    const persistedEntries = savedState?.entries || [];
    const hasPersistedSummary = shouldUsePersistedSummary(persistedEntries.length);

    // A browser draft is only a short-lived safety net. Older v36 drafts must
    // never mask information that was explicitly saved to website memory.
    let sessionDraft: any = null;
    if (sessionDraftKey && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(sessionDraftKey);
        if (raw) sessionDraft = JSON.parse(raw);
      } catch {
        // Ignore malformed browser-only drafts.
      }
    }

    // A stored website summary is deliberately authoritative.  Session storage
    // only protects unsaved work on a brand-new daily form; it must never
    // override a summary that was previously saved to the shared system.
    const useSessionDraft = !hasPersistedSummary;

    if (!hasPersistedSummary && !analysisQuery.data) return;

    if (useSessionDraft && sessionDraft?.amExecutive !== undefined) {
      setAmExecutive(sessionDraft.amExecutive);
      setPmExecutive(sessionDraft.pmExecutive || "");
      setZoneBAmExecutive(sessionDraft.zoneBAmExecutive || "");
      setZoneBPmExecutive(sessionDraft.zoneBPmExecutive || "");
    } else if (savedState?.summary) {
      setAmExecutive(savedState.summary.amExecutive || "");
      setPmExecutive(savedState.summary.pmExecutive || "");
      setZoneBAmExecutive((savedState.summary as any).zoneBAmExecutive || "");
      setZoneBPmExecutive((savedState.summary as any).zoneBPmExecutive || "");
    }

    const savedMap = new Map(persistedEntries.map(entry => [entry.incidentKey, entry]));
    const sessionMap = new Map(
      useSessionDraft ? (sessionDraft?.entries || []).map((entry: any) => [entry.incidentKey, entry]) : []
    );

    let importedMatches: any[] = [];
    const latestImport = savedState?.imports?.[0];
    if (latestImport?.matchedEntries) {
      try {
        importedMatches = JSON.parse(latestImport.matchedEntries);
      } catch {
        // Ignore malformed imported metadata.
      }
    }

    let merged: SummaryIncident[];
    if (hasPersistedSummary) {
      // Render the persisted entry values directly. This works in any browser
      // session and continues to work if a source report was later replaced.
      merged = persistedEntries.map(entry => ({
        incidentKey: entry.incidentKey,
        zone: normalizeZone(entry.zone),
        rideCode: entry.rideCode,
        attraction: entry.attraction,
        description: entry.description,
        downtimeStart: entry.downtimeStart,
        downtimeEnd: entry.downtimeEnd,
        durationMinutes: entry.durationMinutes,
        shift: entry.shift === "PM" ? "PM" : "AM",
        recurringDowntime: entry.recurringDowntime === "Yes" ? "Yes" : "No",
        recurringDowntimeDays: entry.recurringDowntimeDays || "N/A",
        incident: entry.incident === "Yes" ? "Yes" : "No",
        rootCause: entry.rootCause || "",
        correctiveAction: entry.correctiveAction || "",
        preventiveAction: entry.preventiveAction || "",
        partsReplaced: entry.partsReplaced || "N/A",
        followUpAction: entry.followUpAction || "N/A",
        anrNo: entry.anrNo || "N/A",
        supportInfo: entry.supportInfo || "",
        supportPhotoUrl: entry.supportPhotoUrl || null,
        supportPhotoName: entry.supportPhotoName || null,
        status: entry.status === "Closed" || entry.status === "Pending Parts" ? entry.status : "Monitoring",
      }));
    } else {
      const technicalIncidents = analysisQuery.data?.incidentLogs.filter(
        log => log.kind === "technical" && log.rideCode
      ) || [];

      merged = technicalIncidents.map((item, index) => {
        const key = item.id || `inc-${item.dateKey}-${item.rideCode}-${index}`;
        const saved = savedMap.get(key) as any;
        const draft = sessionMap.get(key) as any;
        const times = (item.timeRange || "").split("-");
        const startTime = times[0] || "";
        const endTime = times[1] || "";
        const duration = parseDurationMinutes(item.durationLabel, startTime, endTime);
        const shift = parseShift(startTime);
        const defaultZone = ZONE_ASSIGNMENTS[item.rideCode || ""] || "Zone A";
        const match = importedMatches.find(matchItem => matchesImportedIncident(matchItem, {
          rideCode: item.rideCode || "",
          description: item.description,
          downtimeStart: startTime,
        }));

        return {
          incidentKey: key,
          zone: draft?.zone ? normalizeZone(draft.zone) : (saved?.zone ? normalizeZone(saved.zone) : defaultZone),
          rideCode: item.rideCode || "",
          attraction: item.attraction || item.rideCode || "",
          description: item.description,
          downtimeStart: startTime,
          downtimeEnd: endTime,
          durationMinutes: duration,
          shift,
          recurringDowntime: draft?.recurringDowntime ?? (saved?.recurringDowntime ?? (match?.recurringDowntime || "No")),
          recurringDowntimeDays: draft?.recurringDowntimeDays ?? (saved?.recurringDowntimeDays ?? (match?.recurringDowntimeDays || "N/A")),
          incident: draft?.incident ?? (saved?.incident ?? (match?.incident || "No")),
          rootCause: draft?.rootCause ?? (saved?.rootCause ?? (match?.rootCause || "")),
          correctiveAction: draft?.correctiveAction ?? (saved?.correctiveAction ?? (match?.correctiveAction || "")),
          preventiveAction: draft?.preventiveAction ?? (saved?.preventiveAction ?? (match?.preventiveAction || "")),
          partsReplaced: draft?.partsReplaced ?? (saved?.partsReplaced ?? "N/A"),
          followUpAction: draft?.followUpAction ?? (saved?.followUpAction ?? (match?.followUpAction || "N/A")),
          anrNo: draft?.anrNo ?? (saved?.anrNo ?? "N/A"),
          supportInfo: draft?.supportInfo ?? (saved?.supportInfo ?? ""),
          supportPhotoUrl: draft?.supportPhotoUrl ?? (saved?.supportPhotoUrl ?? null),
          supportPhotoName: draft?.supportPhotoName ?? (saved?.supportPhotoName ?? null),
          status: "Monitoring" as const,
        };
      });
    }

    setIncidents(merged);
    setSelectedIncidentKey(current => merged.some(item => item.incidentKey === current) ? current : (merged[0]?.incidentKey || ""));

    // Each persisted daily report should open ready to export every stored ride.
    const selectionSignature = `${dateKey}:${hasPersistedSummary ? "saved" : "derived"}:${merged.map(item => item.incidentKey).join("|")}`;
    if (selectedKeysSourceRef.current !== selectionSignature) {
      selectedKeysSourceRef.current = selectionSignature;
      setSelectedKeysForExport(new Set(merged.map(item => item.incidentKey)));
    }
  }, [analysisQuery.data, summaryQuery.data, sessionDraftKey, dateKey]);

  useEffect(() => {
    if (!sessionDraftKey || incidents.length === 0 || typeof window === "undefined") return;
    if (summaryQuery.isLoading || shouldUsePersistedSummary(summaryQuery.data?.entries?.length)) {
      sessionStorage.removeItem(sessionDraftKey);
      return;
    }
    const payload = {
      savedAt: Date.now(),
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      entries: incidents,
    };
    try {
      sessionStorage.setItem(sessionDraftKey, JSON.stringify(payload));
    } catch {
      // Browser storage is optional; database memory remains the durable source.
    }
  }, [sessionDraftKey, amExecutive, pmExecutive, zoneBAmExecutive, zoneBPmExecutive, incidents, summaryQuery.data?.entries?.length]);

  const filteredIncidents = useMemo(() => {
    if (zoneFilter === "ALL") return incidents;
    return incidents.filter(i => i.zone === zoneFilter);
  }, [incidents, zoneFilter]);

  const activeIncident = useMemo(() => {
    return incidents.find(i => i.incidentKey === selectedIncidentKey) || filteredIncidents[0] || null;
  }, [incidents, filteredIncidents, selectedIncidentKey]);

  const completionByIncidentKey = useMemo(
    () => new Map(incidents.map(incident => [incident.incidentKey, getSummaryCompletion(incident)])),
    [incidents]
  );

  const selectedReadyCount = useMemo(
    () => incidents.filter(incident => selectedKeysForExport.has(incident.incidentKey) && completionByIncidentKey.get(incident.incidentKey)?.isReady).length,
    [incidents, selectedKeysForExport, completionByIncidentKey]
  );

  const selectedIncompleteCount = Math.max(0, selectedKeysForExport.size - selectedReadyCount);

  const jumpToNextIncomplete = () => {
    const incomplete = filteredIncidents.filter(incident => !completionByIncidentKey.get(incident.incidentKey)?.isReady);
    if (!incomplete.length) {
      toast.success("All visible incidents are ready to export.");
      return;
    }
    const activeIndex = incomplete.findIndex(incident => incident.incidentKey === activeIncident?.incidentKey);
    const next = incomplete[(activeIndex + 1 + incomplete.length) % incomplete.length];
    setSelectedIncidentKey(next.incidentKey);
  };

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
    setSelectedKeysForExport(prev => {
      const next = new Set(prev);
      filteredIncidents.forEach(i => next.add(i.incidentKey));
      return next;
    });
  };

  const deselectAllExport = () => {
    setSelectedKeysForExport(prev => {
      const next = new Set(prev);
      filteredIncidents.forEach(i => next.delete(i.incidentKey));
      return next;
    });
  };

  const saveMutation = trpc.downtimeSummary.save.useMutation({
    onSuccess: () => {
      if (sessionDraftKey && typeof window !== "undefined") sessionStorage.removeItem(sessionDraftKey);
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
      if (sessionDraftKey && typeof window !== "undefined") sessionStorage.removeItem(sessionDraftKey);
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
      toast.success("New report uploaded! Previous report overridden and matched to downtime incidents.");
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      utils.downtimeSummary.listDatesWithData.invalidate();
      if (dateKey === archiveSelectedDate) {
        utils.downtimeSummary.getByDate.invalidate({ dateKey });
      }
    },
    onError: err => {
      toast.error(err.message || "Failed to record import.");
    },
  });

  // Draft Mutations
  const createDraftMutation = trpc.downtimeSummary.createDraft.useMutation({
    onSuccess: () => {
      toast.success("Shift handover draft added.");
      resetDraftForm();
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      if (dateKey === archiveSelectedDate) {
        utils.downtimeSummary.getByDate.invalidate({ dateKey });
      }
      utils.downtimeSummary.listDatesWithData.invalidate();
    },
    onError: err => toast.error(err.message || "Failed to save draft."),
  });

  const updateDraftMutation = trpc.downtimeSummary.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("Shift handover draft updated.");
      resetDraftForm();
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      if (dateKey === archiveSelectedDate) {
        utils.downtimeSummary.getByDate.invalidate({ dateKey });
      }
      utils.downtimeSummary.listDatesWithData.invalidate();
    },
    onError: err => toast.error(err.message || "Failed to update draft."),
  });

  const deleteDraftMutation = trpc.downtimeSummary.deleteDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft removed.");
      setSelectedDraftId(null);
      setDraftToDelete(null);
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      if (dateKey === archiveSelectedDate) {
        utils.downtimeSummary.getByDate.invalidate({ dateKey });
      }
    },
    onError: err => toast.error(err.message || "Failed to delete draft."),
  });

  const resetDraftForm = () => {
    setEditingDraftId(null);
    setDraftRideCode("");
    setDraftStart("");
    setDraftEnd("");
    setDraftDescription("");
    setDraftRootCause("");
    setDraftCorrective("");
    setDraftPreventive("");
    setDraftFollowUp("");
    setIsDraftFormOpen(false);
  };

  const startEditDraft = (d: any) => {
    setEditingDraftId(d.id);
    setDraftRideCode(d.rideCode || "");
    setDraftZone(normalizeZone(d.zone));
    setDraftStart(d.downtimeStart || "");
    setDraftEnd(d.downtimeEnd || "");
    setDraftDescription(d.description || "");
    setDraftRootCause(d.rootCause || "");
    setDraftCorrective(d.correctiveAction || "");
    setDraftPreventive(d.preventiveAction || "");
    setDraftFollowUp(d.followUpAction || "");
    setIsDraftFormOpen(true);
    setSelectedDraftId(d.id);
  };

  const handleSaveOrUpdateDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftRideCode.trim()) {
      toast.error("Please enter a ride code.");
      return;
    }
    const dur = parseDurationMinutes(undefined, draftStart, draftEnd);

    if (editingDraftId) {
      updateDraftMutation.mutate({
        id: editingDraftId,
        zone: draftZone,
        rideCode: draftRideCode.trim().toUpperCase(),
        attraction: draftRideCode.trim().toUpperCase(),
        description: draftDescription.trim(),
        downtimeStart: draftStart.trim(),
        downtimeEnd: draftEnd.trim(),
        durationMinutes: dur,
        rootCause: draftRootCause.trim() || null,
        correctiveAction: draftCorrective.trim() || null,
        preventiveAction: draftPreventive.trim() || null,
        followUpAction: draftFollowUp.trim() || null,
      });
    } else {
      createDraftMutation.mutate({
        reportDate: archiveSelectedDate,
        zone: draftZone,
        rideCode: draftRideCode.trim().toUpperCase(),
        attraction: draftRideCode.trim().toUpperCase(),
        description: draftDescription.trim(),
        downtimeStart: draftStart.trim(),
        downtimeEnd: draftEnd.trim(),
        durationMinutes: dur,
        rootCause: draftRootCause.trim() || null,
        correctiveAction: draftCorrective.trim() || null,
        preventiveAction: draftPreventive.trim() || null,
        followUpAction: draftFollowUp.trim() || null,
      });
    }
  };

  const handleSave = () => {
    if (!effectiveSourceReportId) {
      toast.error("Source report ID is not available.");
      return;
    }
    saveMutation.mutate({
      reportDate: dateKey,
      sourceReportId: effectiveSourceReportId,
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      entries: incidents,
    });
  };

  const handleDownload = () => {
    if (!effectiveSourceReportId) {
      toast.error("Source report ID is not available.");
      return;
    }
    const selectedEntries = incidents.filter(i => selectedKeysForExport.has(i.incidentKey));
    const exportEntries = selectedEntries.filter(i => completionByIncidentKey.get(i.incidentKey)?.isReady);
    if (!exportEntries.length) {
      toast.error("Complete root cause, corrective action, and preventive action for at least one selected event before export.");
      return;
    }
    if (selectedEntries.length > exportEntries.length) {
      toast.info(`${selectedEntries.length - exportEntries.length} incomplete selected event${selectedEntries.length - exportEntries.length === 1 ? " was" : "s were"} excluded from this export.`);
    }
    generateDocxMutation.mutate({
      reportDate: dateKey,
      sourceReportId: effectiveSourceReportId,
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      // Save the complete daily workspace. The server uses these keys only for
      // DOCX rendering, leaving unticked cards in the visible summary form.
      entries: incidents,
      exportEntryKeys: exportEntries.map(entry => entry.incidentKey),
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

      if (result.convertedDocxFileName) {
        toast.info(`PDF converted to DOCX (${result.convertedDocxFileName}) for matching.`);
      }

      await importMutation.mutateAsync({
        reportDate: archiveSelectedDate,
        fileName: result.fileName,
        fileUrl: result.fileUrl,
        fileType: file.name.split(".").pop()?.toLowerCase() || "pdf",
        convertedDocxFileName: result.convertedDocxFileName || (file.name.endsWith(".docx") ? result.fileName : null),
        convertedDocxUrl: result.convertedDocxUrl || (file.name.endsWith(".docx") ? result.fileUrl : null),
        extractedText: result.extractedText || null,
        matchedEntries: result.matchedIncidents ? JSON.stringify(result.matchedIncidents) : null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import file.");
    } finally {
      setIsImportingFile(false);
      setIsArchiveDragging(false);
    }
  };

  // Archive table rows construction
  const archiveTableRows = useMemo(() => {
    const summaryData = archiveSummaryQuery.data;
    if (summaryData?.entries && summaryData.entries.length > 0) {
      return summaryData.entries.map((entry, index) => ({
        id: entry.id || `entry-${index}`,
        zone: entry.zone,
        rideCode: entry.rideCode,
        description: entry.description,
        timeRange: `${entry.downtimeStart}–${entry.downtimeEnd}`,
        duration: `${entry.durationMinutes}m`,
        recurringDowntime: entry.recurringDowntime,
        recurringDowntimeDays: entry.recurringDowntimeDays,
        incident: entry.incident,
        rootCause: entry.rootCause,
        correctiveAction: entry.correctiveAction,
        preventiveAction: entry.preventiveAction,
        partsReplaced: entry.partsReplaced,
        followUpAction: entry.followUpAction,
        status: entry.status,
      }));
    }

    if (archiveAnalysisQuery.data) {
      let importedMatches: any[] = [];
      const latestImport = summaryData?.imports?.[0];
      if (latestImport?.matchedEntries) {
        try {
          importedMatches = JSON.parse(latestImport.matchedEntries);
        } catch {
          // ignore
        }
      }

      return archiveAnalysisQuery.data.incidentLogs
        .filter(l => l.kind === "technical" && l.rideCode)
        .map((l, index) => {
          const times = (l.timeRange || "").split("-");
          const startTime = times[0] || "";
          const endTime = times[1] || "";
          const dur = parseDurationMinutes(l.durationLabel, startTime, endTime);
          const ride = l.rideCode || "";

          const matched = importedMatches.find(m => matchesImportedIncident(m, {
            rideCode: ride,
            description: l.description,
            downtimeStart: startTime,
          }));

          return {
            id: l.id || `analysis-${index}`,
            zone: ZONE_ASSIGNMENTS[ride] || "Zone A",
            rideCode: ride,
            description: l.description,
            timeRange: l.timeRange || "—",
            duration: `${dur}m`,
            recurringDowntime: matched?.recurringDowntime || "No",
            recurringDowntimeDays: matched?.recurringDowntimeDays || "N/A",
            incident: matched?.incident || "No",
            rootCause: matched?.rootCause || "—",
            correctiveAction: matched?.correctiveAction || "—",
            preventiveAction: matched?.preventiveAction || "—",
            partsReplaced: "N/A",
            followUpAction: matched?.followUpAction || "N/A",
            status: "Monitoring",
          };
        });
    }

    return [];
  }, [archiveSummaryQuery.data, archiveAnalysisQuery.data]);

  // Drafts for current archive selected date
  const archiveDrafts = useMemo(() => {
    return archiveSummaryQuery.data?.drafts || [];
  }, [archiveSummaryQuery.data]);

  // Filtered drafts in archive tab
  const filteredArchiveDrafts = useMemo(() => {
    if (draftZoneFilter === "ALL") return archiveDrafts;
    return archiveDrafts.filter(d => normalizeZone(d.zone) === draftZoneFilter);
  }, [archiveDrafts, draftZoneFilter]);

  const selectedDraft = useMemo(() => {
    if (!selectedDraftId) return null;
    return archiveDrafts.find(d => d.id === selectedDraftId) || null;
  }, [archiveDrafts, selectedDraftId]);

  // Handover drafts available for the active editor dateKey
  const activeEditorDrafts = useMemo(() => {
    if (!summaryQuery.data?.drafts) return [];
    return summaryQuery.data.drafts;
  }, [summaryQuery.data]);

  // Transfer ONLY rootCause, correctiveAction, preventiveAction, and followUpAction
  const applyDraftToActiveIncident = (draftItem: any) => {
    if (!activeIncident) return;
    setIncidents(curr =>
      curr.map(item => {
        if (item.incidentKey !== activeIncident.incidentKey) return item;
        return {
          ...item,
          rootCause: draftItem.rootCause || item.rootCause || "",
          correctiveAction: draftItem.correctiveAction || item.correctiveAction || "",
          preventiveAction: draftItem.preventiveAction || item.preventiveAction || "",
          followUpAction: draftItem.followUpAction || item.followUpAction || "N/A",
        };
      })
    );
    toast.success(`Handover info from ${draftItem.rideCode} applied to active incident (Root Cause, Actions, Follow-Up).`);
  };

  const activeExecutiveInCharge = useMemo(() => {
    if (!activeIncident) return "—";
    const isPm = activeIncident.shift === "PM";
    const isZoneB = activeIncident.zone === "Zone B";
    if (isZoneB) {
      return isPm
        ? (zoneBPmExecutive || pmExecutive || "Zone B PM Officer")
        : (zoneBAmExecutive || amExecutive || "Zone B AM Officer");
    }
    return isPm ? (pmExecutive || "PM Executive") : (amExecutive || "AM Executive");
  }, [activeIncident, amExecutive, pmExecutive, zoneBAmExecutive, zoneBPmExecutive]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-transparent p-4 sm:p-6 lg:p-8">
        {/* Top Header */}
        <header className="flex flex-col gap-4 border-b border-[#adbBda]/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Link href="/analysis" className="hover:text-[#1e4ca1] flex items-center gap-1 transition-colors">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Analysis Studio</span>
              </Link>
              <span>/</span>
              <span className="text-[#1e4ca1] font-bold">Downtime Summary</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#162b5b] sm:text-3xl">
              Daily Downtime Summary Workspace
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Technical 11-1 daily reports • 2-page DOCX per event • Memory &amp; shift handover drafts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                  activeTab === "editor"
                    ? "bg-white text-[#1e4ca1] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Active Summary Form</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("archive")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                  activeTab === "archive"
                    ? "bg-white text-[#1e4ca1] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>Memory &amp; Archive</span>
              </button>
            </div>
          </div>

          {activeTab === "editor" && (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || incidents.length === 0}
                className="h-8 gap-1.5 border-indigo-200 bg-white font-bold text-[#1e4ca1] shadow-xs hover:bg-blue-50"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>Save to Memory</span>
              </Button>

              <Button
                size="sm"
                onClick={handleDownload}
                disabled={generateDocxMutation.isPending || selectedReadyCount === 0}
                className="h-8 gap-1.5 bg-[#1e4ca1] hover:bg-[#162b5b] font-bold text-white shadow-xs"
              >
                {generateDocxMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download Summary Report (DOCX) ({selectedReadyCount} ready)
              </Button>
            </div>
          )}
        </header>

        {activeTab === "editor" && (
          <div className="mt-5 space-y-5">
            {/* Executive in Charge section: Collapsible panel */}
            <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <button
                  type="button"
                  onClick={() => setIsExecutivePanelOpen(prev => !prev)}
                  className="flex w-full items-center justify-between text-left transition-colors hover:opacity-90"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="h-4 w-4 text-[#1e4ca1]" />
                    <span className="text-xs font-extrabold text-[#162b5b]">
                      Executives In Charge (Zone A &amp; Zone B)
                    </span>
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      • AM / PM assignments for {formatDisplayDate(dateKey)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#1e4ca1]">
                      {isExecutivePanelOpen ? "Collapse" : "Edit Executives"}
                    </span>
                    {isExecutivePanelOpen ? (
                      <ChevronDown className="h-4 w-4 text-[#1e4ca1]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#1e4ca1]" />
                    )}
                  </div>
                </button>

                {isExecutivePanelOpen && (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
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
                            className="mt-1 h-8 text-xs bg-[#fbfdff]"
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
                            className="mt-1 h-8 text-xs bg-[#fbfdff]"
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
                            className="mt-1 h-8 text-xs bg-[#fbfdff]"
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
                            className="mt-1 h-8 text-xs bg-[#fbfdff]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Handover Drafts Bar in Active Summary Form */}
            {activeEditorDrafts.length > 0 && (
              <Card className="border-amber-300 bg-amber-50/60 shadow-xs">
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-200 text-amber-900 font-bold text-[10px]">
                        Same-Date Shift Handover Drafts ({activeEditorDrafts.length})
                      </Badge>
                      <span className="text-[11px] text-slate-600 hidden sm:inline">
                        Click &ldquo;Apply to Active Incident&rdquo; to transfer root cause, actions, and follow-up only.
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 overflow-x-auto pb-1 pt-1">
                    {activeEditorDrafts.map(d => (
                      <div
                        key={d.id}
                        className="min-w-[280px] max-w-[320px] shrink-0 rounded-xl border border-amber-300 bg-white p-3 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-black text-[#1e4ca1]">{d.rideCode}</span>
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-800">
                            {d.zone} • {d.downtimeStart || "—"} to {d.downtimeEnd || "—"}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-800 line-clamp-1">{d.description || "Draft entry"}</p>
                        {d.rootCause && (
                          <p className="text-[10px] text-slate-600 line-clamp-2 italic">
                            Cause: {d.rootCause}
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyDraftToActiveIncident(d)}
                          disabled={!activeIncident}
                          className="w-full h-6 text-[10px] font-bold border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100"
                        >
                          <ClipboardPaste className="h-3 w-3 mr-1" />
                          Apply to {activeIncident ? activeIncident.rideCode : "Active Incident"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-[330px_1fr]">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm h-fit">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#162b5b]">Today&apos;s Downtime</h3>
                      <p className="text-[11px] text-slate-500">
                        {filteredIncidents.length} technical events • {selectedReadyCount} ready for export
                      </p>
                    </div>
                    <Layers className="h-4 w-4 text-[#1e4ca1]" />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700">Export readiness</span>
                      <Badge className={selectedIncompleteCount ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                        {selectedIncompleteCount ? `${selectedIncompleteCount} need attention` : "All selected ready"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-slate-500">
                      Export includes selected events with root cause, corrective action, and preventive action recorded.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-y border-slate-100 py-1.5 text-[11px]">
                    <span className="font-semibold text-slate-600">Export selection</span>
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

                  <Button
                    type="button"
                    variant="outline"
                    onClick={jumpToNextIncomplete}
                    className="h-9 w-full justify-between border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  >
                    <span>Next incomplete incident</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
                    {filteredIncidents.map(inc => {
                      const isSelected = inc.incidentKey === activeIncident?.incidentKey;
                      const isTicked = selectedKeysForExport.has(inc.incidentKey);
                      const completion = completionByIncidentKey.get(inc.incidentKey)!;

                      return (
                        <div
                          key={inc.incidentKey}
                          onClick={() => setSelectedIncidentKey(inc.incidentKey)}
                          className={`group relative flex items-start rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-[#1e4ca1] bg-blue-50/70 ring-1 ring-[#1e4ca1]/40"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <label
                            className="p-3 pr-1.5 flex items-center justify-center cursor-pointer shrink-0 select-none"
                            onClick={e => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isTicked}
                              onCheckedChange={() => toggleIncidentExport(inc.incidentKey)}
                              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                          </label>

                          <div className="min-w-0 flex-1 py-3 pr-3">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-sm font-black tracking-wide text-[#1e4ca1]">
                                {inc.rideCode}
                              </span>
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[9px] border-slate-300">
                                  {inc.zone} • {inc.shift}
                                </Badge>
                                <Badge className={completion.isReady ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
                                  {completion.isReady ? "Ready" : `Needs ${completion.missing.length}`}
                                </Badge>
                              </div>
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
                            {!completion.isReady && (
                              <p className="mt-1.5 text-[10px] leading-snug text-amber-800">{completion.detail}</p>
                            )}
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
                        {completionByIncidentKey.get(activeIncident.incidentKey)?.isReady ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            Ready to export
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                            {completionByIncidentKey.get(activeIncident.incidentKey)?.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-50/50">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-slate-300">
                            <td className="w-40 bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
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
                              Recurring Downtime
                            </td>
                            <td className="p-2.5 border-r border-slate-300 bg-white">
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                                  <input
                                    type="radio"
                                    name={`recurring-${activeIncident.incidentKey}`}
                                    checked={activeIncident.recurringDowntime === "Yes"}
                                    onChange={() => updateActiveField("recurringDowntime", "Yes")}
                                    className="accent-[#1e4ca1]"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                                  <input
                                    type="radio"
                                    name={`recurring-${activeIncident.incidentKey}`}
                                    checked={activeIncident.recurringDowntime !== "Yes"}
                                    onChange={() => updateActiveField("recurringDowntime", "No")}
                                    className="accent-[#1e4ca1]"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
                            </td>
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Downtime No. of Day (if recurring)
                            </td>
                            <td className="p-2.5 bg-white">
                              <Input
                                placeholder="e.g. 2 or N/A"
                                value={activeIncident.recurringDowntimeDays || ""}
                                onChange={e => updateActiveField("recurringDowntimeDays", e.target.value)}
                                disabled={activeIncident.recurringDowntime !== "Yes"}
                                className="h-7 text-xs"
                              />
                            </td>
                          </tr>

                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Incident
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                                  <input
                                    type="radio"
                                    name={`incident-${activeIncident.incidentKey}`}
                                    checked={activeIncident.incident === "Yes"}
                                    onChange={() => updateActiveField("incident", "Yes")}
                                    className="accent-[#1e4ca1]"
                                  />
                                  <span>Yes</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                                  <input
                                    type="radio"
                                    name={`incident-${activeIncident.incidentKey}`}
                                    checked={activeIncident.incident !== "Yes"}
                                    onChange={() => updateActiveField("incident", "No")}
                                    className="accent-[#1e4ca1]"
                                  />
                                  <span>No</span>
                                </label>
                              </div>
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
                                onKeyDown={e => handleNumberedListKeyDown(e, activeIncident.rootCause || "", val => updateActiveField("rootCause", val))}
                                className="min-h-[70px] text-xs font-sans"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Corrective Action *
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Textarea
                                placeholder="Enter corrective actions taken (e.g. 1. Verified fault... Press Enter for 2.)..."
                                value={activeIncident.correctiveAction || ""}
                                onChange={e => updateActiveField("correctiveAction", e.target.value)}
                                onKeyDown={e => handleNumberedListKeyDown(e, activeIncident.correctiveAction || "", val => updateActiveField("correctiveAction", val))}
                                className="min-h-[70px] text-xs font-sans"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                              Preventive Action *
                            </td>
                            <td colSpan={3} className="p-2.5 bg-white">
                              <Textarea
                                placeholder="Enter preventive maintenance or inspection follow-up (e.g. 1. Inspect switch... Press Enter for 2.)..."
                                value={activeIncident.preventiveAction || ""}
                                onChange={e => updateActiveField("preventiveAction", e.target.value)}
                                onKeyDown={e => handleNumberedListKeyDown(e, activeIncident.preventiveAction || "", val => updateActiveField("preventiveAction", val))}
                                className="min-h-[60px] text-xs font-sans"
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
          <div className="mt-5 space-y-6">
            {/* Top Action & Memory Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setIsCalendarDialogOpen(true)}
                  className="h-9 gap-2 bg-[#1e4ca1] hover:bg-[#162b5b] text-white text-xs font-bold"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span>Choose Summary Date: {formatDisplayDate(archiveSelectedDate)}</span>
                </Button>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  Click to open pop-up calendar with marked summary dates.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveInputRef.current?.click()}
                  disabled={isImportingFile}
                  className="h-8 gap-1.5 border-indigo-300 bg-white text-xs font-bold text-[#1e4ca1] hover:bg-indigo-50"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  <span>{isImportingFile ? "Converting & Matching..." : "Import DOCX / PDF"}</span>
                </Button>
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
              </div>
            </div>

            {/* Calendar Memory Dialog Modal */}
            <Dialog open={isCalendarDialogOpen} onOpenChange={setIsCalendarDialogOpen}>
              <DialogContent className="sm:max-w-md bg-white p-6 rounded-2xl shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-extrabold text-[#162b5b] flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[#1e4ca1]" />
                    <span>Summary Calendar Memory</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Dates marked with blue indicator have saved web summaries or past reports.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex justify-center py-2">
                  <Calendar
                    mode="single"
                    selected={archiveSelectedDate ? new Date(`${archiveSelectedDate}T12:00:00`) : undefined}
                    onDayClick={day => {
                      const y = day.getFullYear();
                      const m = String(day.getMonth() + 1).padStart(2, "0");
                      const d = String(day.getDate()).padStart(2, "0");
                      setArchiveSelectedDate(`${y}-${m}-${d}`);
                      setIsCalendarDialogOpen(false);
                    }}
                    weekStartsOn={1}
                    modifiers={{
                      savedLog: datesWithData.map(d => new Date(`${d}T12:00:00`)),
                    }}
                    className="rounded-xl bg-[#f8faff] p-2"
                  />
                </div>

                <DialogFooter className="sm:justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    Selected: <strong>{formatDisplayDate(archiveSelectedDate)}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCalendarDialogOpen(false)}
                    className="h-8 text-xs font-bold"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Archive Table Preview for Selected Date */}
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
                      {archiveSummaryQuery.data?.imports?.length ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-800 text-[10px]">
                          Import Matched
                        </Badge>
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
                    {archiveSummaryQuery.data?.imports?.[0]?.convertedDocxUrl && (
                      <a
                        href={archiveSummaryQuery.data.imports[0].convertedDocxUrl!}
                        download={archiveSummaryQuery.data.imports[0].convertedDocxFileName || "converted.docx"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                          <Download className="h-3.5 w-3.5" />
                          DOCX Import
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

                    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 uppercase font-extrabold text-[10px]">
                          <tr>
                            <th className="p-2.5 text-left w-16">Zone</th>
                            <th className="p-2.5 text-left w-16">Ride</th>
                            <th className="p-2.5 text-left min-w-[180px]">Description</th>
                            <th className="p-2.5 text-left w-24">Time</th>
                            <th className="p-2.5 text-left w-16">Duration</th>
                            <th className="p-2.5 text-left w-20">Recurring</th>
                            <th className="p-2.5 text-left min-w-[200px]">Root Cause</th>
                            <th className="p-2.5 text-left min-w-[200px]">Corrective Action</th>
                            <th className="p-2.5 text-left min-w-[180px]">Preventive</th>
                            <th className="p-2.5 text-left min-w-[150px]">Follow-Up</th>
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
                              <td className="p-2.5 whitespace-nowrap text-[11px]">
                                <Badge variant="outline" className={row.recurringDowntime === "Yes" ? "border-amber-400 text-amber-800 bg-amber-50" : "border-slate-200 text-slate-500"}>
                                  {row.recurringDowntime === "Yes" ? `Yes (${row.recurringDowntimeDays || "1"})` : "No"}
                                </Badge>
                              </td>
                              <td className="p-2.5">
                                <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                  {renderFormattedActionText(row.rootCause)}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                  {renderFormattedActionText(row.correctiveAction)}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                  {renderFormattedActionText(row.preventiveAction)}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="max-h-[4.5em] overflow-y-auto leading-relaxed text-slate-700 pr-1">
                                  {row.followUpAction || "N/A"}
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
              </CardContent>
            </Card>

            {/* Shift Handover Drafts Section: Zone Tabs + Edit/Save + Side-by-Side View */}
            <Card className="border-[#adbBda]/70 bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/30 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                        Shift Handover Drafts
                      </Badge>
                      <span className="text-[11px] text-slate-500">
                        For {formatDisplayDate(archiveSelectedDate)} (Jot down info before 7:00 PM ops log upload)
                      </span>
                    </div>
                    <h2 className="text-lg font-extrabold text-[#162b5b] mt-1">
                      Pass Downtime Info to Next Shift Executive
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Zone Tabs */}
                    <div className="flex rounded-lg bg-amber-100/70 p-0.5 text-xs font-bold">
                      {(["ALL", "Zone A", "Zone B"] as const).map(z => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setDraftZoneFilter(z)}
                          className={`rounded-md px-2.5 py-1 text-[11px] transition-all ${
                            draftZoneFilter === z
                              ? "bg-white text-amber-900 shadow-xs font-extrabold"
                              : "text-amber-800 hover:text-amber-950"
                          }`}
                        >
                          {z}
                        </button>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isDraftFormOpen) resetDraftForm();
                        else setIsDraftFormOpen(true);
                      }}
                      className="h-8 gap-1.5 text-xs font-bold border-amber-300 text-amber-900 hover:bg-amber-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isDraftFormOpen ? "Close Form" : "Add Handover Draft"}</span>
                    </Button>
                    <Badge variant="outline" className="border-amber-300 text-amber-800 text-xs">
                      {filteredArchiveDrafts.length} draft card(s)
                    </Badge>
                  </div>
                </div>

                {/* Collapsible / Editable Draft Form */}
                {isDraftFormOpen && (
                  <form onSubmit={handleSaveOrUpdateDraft} className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[#162b5b]">
                      <div className="flex items-center gap-1.5">
                        {editingDraftId ? <Edit2 className="h-4 w-4 text-[#1e4ca1]" /> : <Plus className="h-4 w-4 text-[#1e4ca1]" />}
                        <span>{editingDraftId ? "Edit Shift Handover Draft" : "Create Shift Handover Draft Downtime"}</span>
                      </div>
                      {editingDraftId && (
                        <Badge className="bg-amber-200 text-amber-900 font-mono text-[10px]">
                          Editing #{editingDraftId}
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Ride Code *</label>
                        <Input
                          placeholder="e.g. PTA or TTC"
                          value={draftRideCode}
                          onChange={e => setDraftRideCode(e.target.value)}
                          className="mt-1 h-8 text-xs font-mono uppercase bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Zone</label>
                        <select
                          value={draftZone}
                          onChange={e => setDraftZone(e.target.value as "Zone A" | "Zone B")}
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value="Zone A">Zone A</option>
                          <option value="Zone B">Zone B</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Time Down</label>
                        <Input
                          placeholder="e.g. 10:25"
                          value={draftStart}
                          onChange={e => setDraftStart(e.target.value)}
                          className="mt-1 h-8 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Time Up</label>
                        <Input
                          placeholder="e.g. 11:15"
                          value={draftEnd}
                          onChange={e => setDraftEnd(e.target.value)}
                          className="mt-1 h-8 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Downtime Description</label>
                      <Input
                        placeholder="e.g. Technical inspection on RV06 (BGM Issue)"
                        value={draftDescription}
                        onChange={e => setDraftDescription(e.target.value)}
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Root Cause</label>
                        <Textarea
                          placeholder="Suspect wiring loose..."
                          value={draftRootCause}
                          onChange={e => setDraftRootCause(e.target.value)}
                          onKeyDown={e => handleNumberedListKeyDown(e, draftRootCause, setDraftRootCause)}
                          className="mt-1 min-h-[60px] text-xs font-sans bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Corrective Action</label>
                        <Textarea
                          placeholder="1. Power cycle RV... (Enter for 2.)"
                          value={draftCorrective}
                          onChange={e => setDraftCorrective(e.target.value)}
                          onKeyDown={e => handleNumberedListKeyDown(e, draftCorrective, setDraftCorrective)}
                          className="mt-1 min-h-[60px] text-xs font-sans bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Preventive Action</label>
                        <Textarea
                          placeholder="1. Check connector... (Enter for 2.)"
                          value={draftPreventive}
                          onChange={e => setDraftPreventive(e.target.value)}
                          onKeyDown={e => handleNumberedListKeyDown(e, draftPreventive, setDraftPreventive)}
                          className="mt-1 min-h-[60px] text-xs font-sans bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">Follow-Up Action</label>
                        <Textarea
                          placeholder="Check on next dark day..."
                          value={draftFollowUp}
                          onChange={e => setDraftFollowUp(e.target.value)}
                          className="mt-1 min-h-[60px] text-xs font-sans bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetDraftForm}
                        className="h-8 text-xs text-slate-600"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={createDraftMutation.isPending || updateDraftMutation.isPending}
                        className="h-8 gap-1.5 bg-[#1e4ca1] hover:bg-[#162b5b] text-white text-xs font-bold"
                      >
                        {(createDraftMutation.isPending || updateDraftMutation.isPending) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        <span>{editingDraftId ? "Save Changes" : "Save Shift Draft"}</span>
                      </Button>
                    </div>
                  </form>
                )}

                {/* Draft Cards & Details Layout (Side-by-Side on Desktop) */}
                {filteredArchiveDrafts.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_1.3fr] items-start">
                    {/* Cards list */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredArchiveDrafts.map(d => {
                        const isSelected = selectedDraftId === d.id;
                        return (
                          <div
                            key={d.id}
                            onClick={() => setSelectedDraftId(d.id === selectedDraftId ? null : d.id)}
                            className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
                              isSelected
                                ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-300 shadow-sm"
                                : "border-slate-200 bg-white hover:border-amber-300 hover:shadow-xs"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-black text-[#1e4ca1]">{d.rideCode}</span>
                              <Badge variant="outline" className="text-[9px] border-slate-300">{d.zone}</Badge>
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-800 line-clamp-1">{d.description || "Draft incident"}</div>
                            <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                              <span>{d.downtimeStart || "—"} - {d.downtimeEnd || "—"}</span>
                              <span className="font-bold text-rose-700">{d.durationMinutes ? `${d.durationMinutes}m` : ""}</span>
                            </div>
                            {d.rootCause && (
                              <p className="mt-1.5 text-[10px] text-slate-600 line-clamp-2 italic">
                                Cause: {d.rootCause}
                              </p>
                            )}

                            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                              <span className="text-[10px] font-bold text-amber-800">
                                {isSelected ? "Viewing details →" : "Click to view"}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={e => {
                                    e.stopPropagation();
                                    startEditDraft(d);
                                  }}
                                  className="h-6 px-1.5 text-xs text-[#1e4ca1] hover:bg-blue-50"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  <span className="text-[10px] ml-1">Edit</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setDraftToDelete({ id: d.id, rideCode: d.rideCode });
                                  }}
                                  className="h-6 px-1.5 text-xs text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span className="text-[10px] ml-1">Delete</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Details Panel Side-by-Side */}
                    <div>
                      {selectedDraft ? (
                        <div className="rounded-xl border border-amber-300 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                                Selected Handover Draft Details
                              </span>
                              <h3 className="text-sm font-extrabold text-[#162b5b]">
                                {selectedDraft.rideCode} — {selectedDraft.zone} ({selectedDraft.downtimeStart || "—"} to {selectedDraft.downtimeEnd || "—"})
                              </h3>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditDraft(selectedDraft)}
                                className="h-7 text-xs font-bold border-indigo-200 text-[#1e4ca1]"
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Edit Draft
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedDraftId(null)}
                                className="h-7 text-xs text-slate-400 hover:text-slate-700"
                              >
                                Close
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                              <span className="block font-bold text-slate-700 mb-0.5">Downtime Description</span>
                              <p className="text-slate-800 font-mono text-[11px]">{selectedDraft.description || "—"}</p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                              <span className="block font-bold text-slate-700 mb-0.5">Root Cause</span>
                              <p className="text-slate-600 whitespace-pre-wrap">{selectedDraft.rootCause || "—"}</p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                              <span className="block font-bold text-slate-700 mb-0.5">Corrective Action</span>
                              <div className="text-slate-600">
                                {renderFormattedActionText(selectedDraft.correctiveAction)}
                              </div>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                              <span className="block font-bold text-slate-700 mb-0.5">Preventive Action</span>
                              <div className="text-slate-600">
                                {renderFormattedActionText(selectedDraft.preventiveAction)}
                              </div>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                              <span className="block font-bold text-slate-700 mb-0.5">Follow-Up Action</span>
                              <p className="text-slate-600 whitespace-pre-wrap">{selectedDraft.followUpAction || "N/A"}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-8 text-center text-xs text-slate-500">
                          Select a handover draft card on the left to review its complete details alongside.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 p-6 text-center text-xs text-amber-900">
                    No handover drafts created for {formatDisplayDate(archiveSelectedDate)} {draftZoneFilter !== "ALL" ? `under ${draftZoneFilter}` : ""} yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confirmation Dialog for Draft Deletion */}
            <Dialog open={Boolean(draftToDelete)} onOpenChange={open => !open && setDraftToDelete(null)}>
              <DialogContent className="sm:max-w-sm bg-white p-5 rounded-2xl shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-sm font-extrabold text-[#162b5b]">
                    Confirm Delete Handover Draft
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-600">
                    Are you sure you want to delete the handover draft for <strong>{draftToDelete?.rideCode}</strong>? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter className="gap-2 sm:gap-0 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraftToDelete(null)}
                    className="h-8 text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={deleteDraftMutation.isPending}
                    onClick={() => draftToDelete && deleteDraftMutation.mutate({ id: draftToDelete.id })}
                    className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold gap-1"
                  >
                    {deleteDraftMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    <span>Confirm Delete</span>
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
