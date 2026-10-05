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
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  recurringDowntime: "Yes" | "No";
  recurringDowntimeDays: string;
  incident: "Yes" | "No";
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
// Zone A: BWZ, RTR, ESD, IDD, NTM, PTA, POTA, BCT (EV/RC/UZ/ZC), AFP, TTC
// Zone B: MFZ, ACR, SRS, ETI, EHF, VTM, BSC, RCC, SAG
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

function normaliseMatchText(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesImportedIncident(
  imported: { rideCode?: string; description?: string; downtimeStart?: string },
  incident: { rideCode: string; description: string; downtimeStart: string }
) {
  const importedRide = (imported.rideCode || "").toUpperCase();
  const localRide = (incident.rideCode || "").toUpperCase();
  const rideMatches = importedRide === localRide || (importedRide === "POTA" && localRide === "PTA");
  const timeMatches = Boolean(imported.downtimeStart) && Boolean(incident.downtimeStart) && imported.downtimeStart === incident.downtimeStart;
  const importedDescription = normaliseMatchText(imported.description);
  const localDescription = normaliseMatchText(incident.description);
  const descriptionMatches = Boolean(importedDescription && localDescription) && (
    importedDescription.includes(localDescription) || localDescription.includes(importedDescription)
  );
  return rideMatches && timeMatches && descriptionMatches;
}

// Requirement: Automatically gives new line break for new numbering when numbered list is typed (e.g. 1. -> 2.)
function handleNumberedListKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, currentValue: string, onChange: (val: string) => void) {
  if (e.key === "Enter" && !e.shiftKey) {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const textBefore = currentValue.substring(0, start);
    const textAfter = currentValue.substring(textarea.selectionEnd);

    // Find the current line before the cursor
    const lines = textBefore.split("\n");
    const currentLine = lines[lines.length - 1];

    // Check if the current line starts with a number like "1." or "1. "
    const match = /^(\s*)(\d+)\.\s*(.*)$/.exec(currentLine);
    if (match) {
      e.preventDefault();
      const indent = match[1];
      const num = parseInt(match[2], 10);
      const content = match[3];

      // If the line is empty numbered item (e.g. "2. " with nothing else), remove the number on second Enter
      if (!content.trim()) {
        const withoutEmptyNum = textBefore.substring(0, textBefore.length - currentLine.length) + "\n" + textAfter;
        onChange(withoutEmptyNum);
        return;
      }

      const nextNum = num + 1;
      const insert = `\n${indent}${nextNum}. `;
      const newValue = textBefore + insert + textAfter;
      onChange(newValue);

      // Restore cursor position after the newly inserted number
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      }, 0);
    }
  }
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

  // New Draft State
  const [isDraftFormOpen, setIsDraftFormOpen] = useState(false);
  const [draftRideCode, setDraftRideCode] = useState("");
  const [draftZone, setDraftZone] = useState<"Zone A" | "Zone B">("Zone A");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftRootCause, setDraftRootCause] = useState("");
  const [draftCorrective, setDraftCorrective] = useState("");
  const [draftPreventive, setDraftPreventive] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);

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

  // Session storage key for uncommitted form retention:
  // Requirement: "whatever text they have typed should remain preserved during the current session,
  // and only reset when the browser tab is closed."
  const sessionDraftKey = useMemo(() => (dateKey ? `downtime-summary-draft-v35-${dateKey}` : ""), [dateKey]);

  // Initialize and merge incident state
  useEffect(() => {
    if (!analysisQuery.data) return;

    // Filter strictly to technical downtime
    const technicalIncidents = analysisQuery.data.incidentLogs.filter(
      l => l.kind === "technical" && l.rideCode
    );

    const savedState = summaryQuery.data;

    // Check sessionStorage first for uncommitted work
    let sessionDraft: any = null;
    if (sessionDraftKey && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(sessionDraftKey);
        if (raw) sessionDraft = JSON.parse(raw);
      } catch {
        // ignore
      }
    }

    if (sessionDraft?.amExecutive !== undefined) {
      setAmExecutive(sessionDraft.amExecutive);
    } else if (savedState?.summary?.amExecutive) {
      setAmExecutive(savedState.summary.amExecutive);
    }

    if (sessionDraft?.pmExecutive !== undefined) {
      setPmExecutive(sessionDraft.pmExecutive);
    } else if (savedState?.summary?.pmExecutive) {
      setPmExecutive(savedState.summary.pmExecutive);
    }

    if (sessionDraft?.zoneBAmExecutive !== undefined) {
      setZoneBAmExecutive(sessionDraft.zoneBAmExecutive);
    } else if ((savedState?.summary as any)?.zoneBAmExecutive) {
      setZoneBAmExecutive((savedState?.summary as any).zoneBAmExecutive);
    }

    if (sessionDraft?.zoneBPmExecutive !== undefined) {
      setZoneBPmExecutive(sessionDraft.zoneBPmExecutive);
    } else if ((savedState?.summary as any)?.zoneBPmExecutive) {
      setZoneBPmExecutive((savedState?.summary as any).zoneBPmExecutive);
    }

    const savedMap = new Map((savedState?.entries || []).map(e => [e.incidentKey, e]));
    const sessionMap = new Map((sessionDraft?.entries || []).map((e: any) => [e.incidentKey, e]));

    // Check if an imported report exists for this date and has matched entries to autofill
    let importedMatches: any[] = [];
    const latestImport = savedState?.imports?.[0];
    if (latestImport?.matchedEntries) {
      try {
        importedMatches = JSON.parse(latestImport.matchedEntries);
      } catch {
        // ignore
      }
    }

    const merged: SummaryIncident[] = technicalIncidents.map((item, index) => {
      const key = item.id || `inc-${item.dateKey}-${item.rideCode}-${index}`;
      const saved = savedMap.get(key) as any;
      const draft = sessionMap.get(key) as any;
      const times = (item.timeRange || "").split("-");
      const startTime = times[0] || "";
      const endTime = times[1] || "";
      const duration = parseDurationMinutes(item.durationLabel, startTime, endTime);
      const shift = parseShift(startTime);
      const defaultZone = ZONE_ASSIGNMENTS[item.rideCode || ""] || "Zone A";

      // Match imports strictly by ride, downtime description, and time down.
      const match = importedMatches.find(m => matchesImportedIncident(m, {
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
        recurringDowntime: (draft?.recurringDowntime ?? (saved as any)?.recurringDowntime ?? match?.recurringDowntime ?? "No") as "Yes" | "No",
        recurringDowntimeDays: draft?.recurringDowntimeDays ?? (saved as any)?.recurringDowntimeDays ?? match?.recurringDowntimeDays ?? "N/A",
        incident: (draft?.incident ?? (saved as any)?.incident ?? match?.incident ?? "No") as "Yes" | "No",
        rootCause: draft?.rootCause ?? saved?.rootCause ?? match?.rootCause ?? "",
        correctiveAction: draft?.correctiveAction ?? saved?.correctiveAction ?? match?.correctiveAction ?? "",
        preventiveAction: draft?.preventiveAction ?? saved?.preventiveAction ?? match?.preventiveAction ?? "",
        partsReplaced: draft?.partsReplaced ?? saved?.partsReplaced ?? "N/A",
        followUpAction: draft?.followUpAction ?? saved?.followUpAction ?? "N/A",
        anrNo: draft?.anrNo ?? saved?.anrNo ?? "N/A",
        supportInfo: draft?.supportInfo ?? saved?.supportInfo ?? "",
        supportPhotoUrl: draft?.supportPhotoUrl ?? saved?.supportPhotoUrl ?? null,
        supportPhotoName: draft?.supportPhotoName ?? saved?.supportPhotoName ?? null,
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
  }, [analysisQuery.data, summaryQuery.data, sessionDraftKey]);

  // Synchronize uncommitted form edits to sessionStorage so work is preserved when switching tabs or pages
  useEffect(() => {
    if (!sessionDraftKey || incidents.length === 0 || typeof window === "undefined") return;
    const payload = {
      amExecutive,
      pmExecutive,
      zoneBAmExecutive,
      zoneBPmExecutive,
      entries: incidents,
    };
    try {
      sessionStorage.setItem(sessionDraftKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [sessionDraftKey, amExecutive, pmExecutive, zoneBAmExecutive, zoneBPmExecutive, incidents]);

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
      setDraftRideCode("");
      setDraftStart("");
      setDraftEnd("");
      setDraftDescription("");
      setDraftRootCause("");
      setDraftCorrective("");
      setDraftPreventive("");
      setIsDraftFormOpen(false);
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
      utils.downtimeSummary.listDatesWithData.invalidate();
    },
    onError: err => toast.error(err.message || "Failed to save draft."),
  });

  const deleteDraftMutation = trpc.downtimeSummary.deleteDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft removed.");
      setSelectedDraftId(null);
      utils.downtimeSummary.getByDate.invalidate({ dateKey: archiveSelectedDate });
    },
    onError: err => toast.error(err.message || "Failed to delete draft."),
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

  const handleAddDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftRideCode.trim()) {
      toast.error("Please enter a ride code.");
      return;
    }
    const dur = parseDurationMinutes(undefined, draftStart, draftEnd);
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

      if (result.convertedDocxFileName) {
        toast.info(`PDF converted to DOCX (${result.convertedDocxFileName}) for matching.`);
      }

      await importMutation.mutateAsync({
        reportDate: archiveSelectedDate,
        fileName: result.fileName,
        fileUrl: result.fileUrl,
        fileType: ext,
        extractedText: result.extractedText || null,
        convertedDocxFileName: result.convertedDocxFileName || null,
        convertedDocxUrl: result.convertedDocxUrl || null,
        matchedEntries: result.matchedEntries || null,
      });

      // Requirement: When a report is uploaded, parse it and match rootcause, corrective, preventive
      // by ride, description, and starting time, and display them directly in the table.
      // If we have saved summary entries for this date or raw tech logs, automatically update them!
      if (result.matchedEntries && archiveTargetReport) {
        try {
          const parsedMatched: any[] = JSON.parse(result.matchedEntries);
          const currentEntries = archiveSummaryQuery.data?.entries || [];
          if (currentEntries.length > 0) {
            const updated = currentEntries.map(entry => {
              const match = parsedMatched.find(m => matchesImportedIncident(m, entry));
              if (!match) return entry;
              return {
                ...entry,
                rootCause: match.rootCause || entry.rootCause,
                correctiveAction: match.correctiveAction || entry.correctiveAction,
                preventiveAction: match.preventiveAction || entry.preventiveAction,
                recurringDowntime: match.recurringDowntime || (entry as any).recurringDowntime || "No",
                recurringDowntimeDays: match.recurringDowntimeDays || (entry as any).recurringDowntimeDays || "N/A",
                incident: match.incident || (entry as any).incident || "No",
              };
            });
            await saveMutation.mutateAsync({
              reportDate: archiveSelectedDate,
              sourceReportId: archiveTargetReport.id,
              amExecutive: archiveSummaryQuery.data?.summary?.amExecutive || "",
              pmExecutive: archiveSummaryQuery.data?.summary?.pmExecutive || "",
              zoneBAmExecutive: (archiveSummaryQuery.data?.summary as any)?.zoneBAmExecutive || "",
              zoneBPmExecutive: (archiveSummaryQuery.data?.summary as any)?.zoneBPmExecutive || "",
              entries: updated as any,
            });
            toast.success("Archive table fields updated with imported root causes and actions.");
          }
        } catch (e) {
          console.warn("Failed to auto-apply matched imported fields:", e);
        }
      }
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
    if (activeShift === "PM") {
      return pmExecutive ? `PM – ${pmExecutive}` : "PM – (Unassigned)";
    }
    return amExecutive ? `AM – ${amExecutive}` : "AM – (Unassigned)";
  }, [activeZone, activeShift, amExecutive, pmExecutive, zoneBAmExecutive, zoneBPmExecutive]);

  // Build archive table preview rows (from saved summary entries or fallback raw technical logs)
  const archiveTableRows = useMemo(() => {
    const savedEntries = archiveSummaryQuery.data?.entries;
    let importedMatched: any[] = [];
    const latestImport = archiveSummaryQuery.data?.imports?.[0];
    if (latestImport?.matchedEntries) {
      try {
        importedMatched = JSON.parse(latestImport.matchedEntries);
      } catch {
        // ignore
      }
    }

    if (savedEntries && savedEntries.length > 0) {
      return savedEntries.map(e => {
        // Check if there's a fresh imported match if saved fields are blank
        const match = importedMatched.find(m => matchesImportedIncident(m, e));

        return {
          id: String(e.id),
          zone: normalizeZone(e.zone),
          rideCode: e.rideCode,
          description: e.description,
          timeRange: `${e.downtimeStart}–${e.downtimeEnd}`,
          duration: `${e.durationMinutes}m`,
          recurringDowntime: (e as any).recurringDowntime || match?.recurringDowntime || "No",
          recurringDowntimeDays: (e as any).recurringDowntimeDays || match?.recurringDowntimeDays || "N/A",
          incident: (e as any).incident || match?.incident || "No",
          rootCause: e.rootCause || match?.rootCause || "—",
          correctiveAction: e.correctiveAction || match?.correctiveAction || "—",
          preventiveAction: e.preventiveAction || match?.preventiveAction || "—",
          isSaved: true,
        };
      });
    }

    const techLogs = archiveAnalysisQuery.data?.incidentLogs.filter(l => l.kind === "technical" && l.rideCode) || [];
    return techLogs.map((l, idx) => {
      const times = (l.timeRange || "").split("-");
      const duration = parseDurationMinutes(l.durationLabel, times[0], times[1]);
      const defaultZone = ZONE_ASSIGNMENTS[l.rideCode || ""] || "Zone A";
      const match = importedMatched.find(m => matchesImportedIncident(m, {
        rideCode: l.rideCode || "",
        description: l.description,
        downtimeStart: times[0] || "",
      }));

      return {
        id: `raw-${idx}-${l.rideCode}`,
        zone: defaultZone,
        rideCode: l.rideCode || "",
        description: l.description,
        timeRange: l.timeRange || "—",
        duration: `${duration}m`,
        recurringDowntime: match?.recurringDowntime || "No",
        recurringDowntimeDays: match?.recurringDowntimeDays || "N/A",
        incident: match?.incident || "No",
        rootCause: match?.rootCause || "— (Unsaved raw log)",
        correctiveAction: match?.correctiveAction || "—",
        preventiveAction: match?.preventiveAction || "—",
        isSaved: false,
      };
    });
  }, [archiveSummaryQuery.data?.entries, archiveSummaryQuery.data?.imports, archiveAnalysisQuery.data?.incidentLogs]);

  // Helper to render text with clean line breaks for numbered lists in archive table
  const renderFormattedActionText = (text: string) => {
    if (!text || text === "—") return <span className="text-slate-400">—</span>;
    const lines = text.split(/\r?\n/).flatMap(l => l.split(/(?=\b\d+\.\s+)/)).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return <span>{text}</span>;
    return (
      <div className="space-y-1">
        {lines.map((line, idx) => (
          <div key={idx} className="leading-snug">{line}</div>
        ))}
      </div>
    );
  };

  const archiveDrafts = archiveSummaryQuery.data?.drafts || [];
  const selectedDraft = useMemo(() => {
    return archiveDrafts.find(d => d.id === selectedDraftId) || null;
  }, [archiveDrafts, selectedDraftId]);

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] pb-28 text-slate-900">
        <header className="px-1 pt-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
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

            {/* Requirement: Position tabs right below the page title */}
            <div className="mt-3 inline-flex rounded-xl bg-slate-200/90 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`rounded-lg px-4 py-1.5 text-xs font-extrabold transition-all ${
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
                className={`rounded-lg px-4 py-1.5 text-xs font-extrabold transition-all ${
                  activeTab === "archive"
                    ? "bg-[#1e4ca1] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Memory & Archive
              </button>
            </div>
          </div>

          {activeTab === "editor" && (
            <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
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
          )}
        </header>

        {activeTab === "editor" && (
          <div className="mt-5 space-y-5">
            {/* Requirement: Executive in Charge section shall be shortened, like drop down, when click only show up */}
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
                              {/* Requirement: ride code bold and clear font in downtime selection */}
                              <span className="font-mono text-sm font-black tracking-wide text-[#1e4ca1]">
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

                          {/* Requirement: Recurring Downtime, Downtime No. of Day, Incident checkboxes */}
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
            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
              <Card className="border-[#adbBda]/70 bg-white/95 shadow-sm h-fit">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#162b5b]">Summary Calendar Memory</h3>
                      <p className="text-[11px] text-slate-500">
                        Selected: <strong className="text-[#1e4ca1] font-mono">{formatDisplayDate(archiveSelectedDate)}</strong>
                      </p>
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
                    <p className="text-[10px] text-slate-500">
                      Uploading replaces previous import for this date, converts PDFs to DOCX, and updates root causes &amp; actions in the table above.
                    </p>
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
                        {isImportingFile ? "Converting & Matching..." : "Choose File"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
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

                {/* Requirement: Shift Handover Drafts section that is collapsible/expandable, and shows selected card details below */}
                <Card className="border-[#adbBda]/70 bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/30 shadow-sm">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                            Shift Handover Drafts
                          </Badge>
                          <span className="text-[11px] text-slate-500">
                            For {formatDisplayDate(archiveSelectedDate)} (Before 7:00 PM ops log upload)
                          </span>
                        </div>
                        <h2 className="text-lg font-extrabold text-[#162b5b] mt-1">
                          Pass Downtime Info to Next Shift Executive
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsDraftFormOpen(prev => !prev)}
                          className="h-8 gap-1.5 text-xs font-bold border-amber-300 text-amber-900 hover:bg-amber-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{isDraftFormOpen ? "Close Form" : "Add New Handover Draft"}</span>
                        </Button>
                        <Badge variant="outline" className="border-amber-300 text-amber-800 text-xs">
                          {archiveDrafts.length} draft card(s)
                        </Badge>
                      </div>
                    </div>

                    {/* Collapsible Add New Draft Form */}
                    {isDraftFormOpen && (
                      <form onSubmit={handleAddDraft} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#162b5b]">
                          <Plus className="h-4 w-4 text-[#1e4ca1]" />
                          <span>Create Shift Handover Draft Downtime</span>
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

                        <div className="grid gap-3 sm:grid-cols-3">
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
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsDraftFormOpen(false)}
                            className="h-8 text-xs text-slate-600"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={createDraftMutation.isPending}
                            className="h-8 gap-1.5 bg-[#1e4ca1] hover:bg-[#162b5b] text-white text-xs font-bold"
                          >
                            {createDraftMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            <span>Save Shift Draft</span>
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Draft Cards View */}
                    {archiveDrafts.length > 0 ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          {archiveDrafts.map(d => (
                            <div
                              key={d.id}
                              onClick={() => setSelectedDraftId(d.id === selectedDraftId ? null : d.id)}
                              className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
                                selectedDraftId === d.id
                                  ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-300"
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
                              <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
                                <span className="text-[10px] font-bold text-amber-800">
                                  {selectedDraftId === d.id ? "Viewing below ↓" : "Click to view full"}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={e => {
                                    e.stopPropagation();
                                    deleteDraftMutation.mutate({ id: d.id });
                                  }}
                                  className="h-6 px-1.5 text-xs text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span className="text-[10px] ml-1">Delete</span>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Requirement: Selected draft details displayed below the drafts section */}
                        {selectedDraft && (
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
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedDraftId(null)}
                                className="h-7 text-xs text-slate-400 hover:text-slate-700"
                              >
                                Close Details
                              </Button>
                            </div>

                            <div className="grid gap-3 text-xs sm:grid-cols-3">
                              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                                <span className="block font-bold text-slate-700 mb-1">Root Cause</span>
                                <p className="text-slate-600 whitespace-pre-wrap">{selectedDraft.rootCause || "—"}</p>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                                <span className="block font-bold text-slate-700 mb-1">Corrective Action</span>
                                <p className="text-slate-600 whitespace-pre-wrap">{selectedDraft.correctiveAction || "—"}</p>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                                <span className="block font-bold text-slate-700 mb-1">Preventive Action</span>
                                <p className="text-slate-600 whitespace-pre-wrap">{selectedDraft.preventiveAction || "—"}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 p-4 text-center text-xs text-amber-900">
                        No handover drafts created for {formatDisplayDate(archiveSelectedDate)} yet. Use the button above to jot down daytime downtime before ops uploads the 7:00 PM log.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
