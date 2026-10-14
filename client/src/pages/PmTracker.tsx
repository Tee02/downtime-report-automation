import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  MessageSquarePlus,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { FLEET_RIDES } from "@/components/RideCombinationSwitch";
import {
  getRideFullName,
  getRideZone,
  PM_WORK_TYPES,
  PmStatus,
  PmWorkType,
  PmZone,
  ZONE_A_RIDES,
  ZONE_B_RIDES,
} from "@/data/pmTracker";
import { trpc } from "@/lib/trpc";
import { format, isSameDay, parseISO } from "date-fns";

type LogDraft = {
  logDate: string;
  rideCode: string;
  zone: PmZone;
  status: PmStatus;
  workType: PmWorkType;
  technician: string;
  summary: string;
  message: string;
};

const blankLogDraft: LogDraft = {
  logDate: format(new Date(), "yyyy-MM-dd"),
  rideCode: "ACR",
  zone: "Zone B",
  status: "Completed",
  workType: "Opening startup",
  technician: "",
  summary: "",
  message: "",
};

export default function PmTracker() {
  const [activeZone, setActiveZone] = useState<PmZone>("Zone A");
  const [selectedRideFilter, setSelectedRideFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Calendar month state
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  // Keep the calendar as the default on phones; agenda is available on demand.
  const [mobileView, setMobileView] = useState<"calendar" | "agenda">("calendar");

  // Selected date for day details drawer/panel
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    () => format(new Date(), "yyyy-MM-dd")
  );

  // Dialogs
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draft, setDraft] = useState<LogDraft>(blankLogDraft);
  const [activeDetailLog, setActiveDetailLog] = useState<any | null>(null);

  // tRPC utilities and queries
  const trpcUtils = trpc.useUtils();
  const { data: logs = [], isLoading } = trpc.pmTracker.list.useQuery();
  const { data: darkDays = [] } = trpc.darkDays.list.useQuery();
  const { data: savedReports = [] } = trpc.savedReports.list.useQuery();

  // Create mutation
  const createMutation = trpc.pmTracker.create.useMutation({
    onSuccess: async () => {
      await trpcUtils.pmTracker.list.invalidate();
      toast.success("PM log entry recorded successfully.");
      setCreateModalOpen(false);
      setDraft(blankLogDraft);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record log entry.");
    },
  });

  // Delete mutation
  const deleteMutation = trpc.pmTracker.delete.useMutation({
    onSuccess: async () => {
      await trpcUtils.pmTracker.list.invalidate();
      toast.success("Log entry deleted.");
      setActiveDetailLog(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete log entry.");
    },
  });

  // Server-side workbook export keeps the digital logbook in an actual .xlsx file.
  const exportMutation = trpc.pmTracker.exportExcel.useMutation({
    onSuccess: ({ downloadUrl, fileName, logCount }) => {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Generated Excel logbook with ${logCount} PM record${logCount === 1 ? "" : "s"}.`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate PM Tracker Excel workbook.");
    },
  });

  // Saved report downtime map for 1% KPI downtime indicator on top-left of calendar cell
  const reportDowntimeMap = useMemo(() => {
    const map = new Map<string, { totalDowntimePct: number; isWithinKpi: boolean }>();
    for (const r of savedReports) {
      const totalPct = Number(r.totalNetworkPercentage ?? 0);
      map.set(r.reportDate, {
        totalDowntimePct: totalPct,
        isWithinKpi: totalPct < 1.0,
      });
    }
    return map;
  }, [savedReports]);

  // Dark day set
  const darkDaySet = useMemo(() => new Set(darkDays), [darkDays]);

  // Ride options constrained by active zone or full list
  const activeZoneRides = useMemo(() => {
    return FLEET_RIDES.filter(([code]) =>
      activeZone === "Zone A" ? ZONE_A_RIDES.includes(code) : ZONE_B_RIDES.includes(code)
    );
  }, [activeZone]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Zone match
      if (log.zone !== activeZone) return false;

      // Ride filter
      if (selectedRideFilter !== "ALL" && log.rideCode !== selectedRideFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "ALL" && log.status !== statusFilter) {
        return false;
      }

      // Keyword query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRide =
          log.rideCode.toLowerCase().includes(q) || log.rideName.toLowerCase().includes(q);
        const matchesTech = log.technician.toLowerCase().includes(q);
        const matchesSummary = log.summary.toLowerCase().includes(q);
        const matchesMsg = log.message.toLowerCase().includes(q);
        const matchesWork = log.workType.toLowerCase().includes(q);
        if (!matchesRide && !matchesTech && !matchesSummary && !matchesMsg && !matchesWork) {
          return false;
        }
      }

      return true;
    });
  }, [logs, activeZone, selectedRideFilter, statusFilter, searchQuery]);

  // Group filtered logs by date (YYYY-MM-DD)
  const logsByDate = useMemo(() => {
    const map = new Map<string, typeof logs>();
    for (const log of filteredLogs) {
      const arr = map.get(log.logDate) || [];
      arr.push(log);
      map.set(log.logDate, arr);
    }
    return map;
  }, [filteredLogs]);

  // Calendar dates generation (grid for currentMonth)
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Monday-based indexing: Sunday = 6, Monday = 0
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: { dateStr: string; date: Date; isCurrentMonth: boolean }[] = [];

    // Preceding month padding
    for (let i = startDayOfWeek; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      days.push({
        dateStr: format(d, "yyyy-MM-dd"),
        date: d,
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const d = new Date(year, month, day);
      days.push({
        dateStr: format(d, "yyyy-MM-dd"),
        date: d,
        isCurrentMonth: true,
      });
    }

    // Trailing padding to make full 7-day rows (max 35 or 42)
    const remainder = days.length % 7;
    if (remainder !== 0) {
      const daysToAdd = 7 - remainder;
      const lastDate = days[days.length - 1].date;
      for (let i = 1; i <= daysToAdd; i++) {
        const d = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + i);
        days.push({
          dateStr: format(d, "yyyy-MM-dd"),
          date: d,
          isCurrentMonth: false,
        });
      }
    }

    return days;
  }, [currentMonth]);

  // Month navigation
  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedCalendarDate(format(today, "yyyy-MM-dd"));
  };

  // When user picks a ride in draft form, auto-set its zone
  const handleDraftRideChange = (rideCode: string) => {
    const zone = getRideZone(rideCode);
    setDraft((cur) => ({
      ...cur,
      rideCode,
      zone,
    }));
  };

  // Save new log
  const handleSaveLog = () => {
    if (!draft.message.trim()) {
      toast.error("Please paste or type the supervisor message before saving.");
      return;
    }

    const rideName = getRideFullName(draft.rideCode);
    const summary =
      draft.summary.trim() ||
      draft.message.trim().slice(0, 120).replace(/\s+/g, " ");

    createMutation.mutate({
      logDate: draft.logDate,
      zone: draft.zone,
      rideCode: draft.rideCode,
      rideName,
      status: draft.status,
      workType: draft.workType,
      technician: draft.technician.trim(),
      summary,
      message: draft.message.trim(),
    });
  };

  // Export current filtered logs through the backend as a formatted .xlsx workbook.
  const handleExportExcel = () => {
    if (!filteredLogs.length) {
      toast.error("No PM logs match the selected filters to export.");
      return;
    }

    exportMutation.mutate({
      zone: activeZone,
      rideCode: selectedRideFilter === "ALL" ? undefined : selectedRideFilter,
      status: statusFilter === "ALL" ? undefined : (statusFilter as PmStatus),
      query: searchQuery.trim() || undefined,
    });
  };

  // Selected date logs for the side drawer/detail panel
  const selectedDateLogs = useMemo(() => {
    return logsByDate.get(selectedCalendarDate) || [];
  }, [logsByDate, selectedCalendarDate]);

  const mobileAgendaDays = useMemo(() => {
    const prefix = format(currentMonth, "yyyy-MM");
    const days = new Set<string>([
      ...Array.from(logsByDate.keys()).filter(day => day.startsWith(prefix)),
      ...Array.from(darkDaySet).filter(day => day.startsWith(prefix)),
    ]);

    return Array.from(days)
      .sort((a, b) => b.localeCompare(a))
      .map(dateStr => ({
        dateStr,
        logs: logsByDate.get(dateStr) || [],
        isDarkDay: darkDaySet.has(dateStr),
      }));
  }, [currentMonth, logsByDate, darkDaySet]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
        {/* Header with Zone Switcher & Actions */}
        <header className="flex flex-col justify-between gap-4 border-b border-[#9facd3]/55 pb-5 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
                <ClipboardList className="h-3.5 w-3.5" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b6aa4]">
                Digital Ride Maintenance & Overtime Logbook
              </p>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#22305e] sm:text-4xl">
              PM Tracker
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Record opening, closing, morning/night OT, dark-day, rehab, and preventive maintenance logs digitally.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Zone Switcher (Zone A vs Zone B) */}
            <div className="flex items-center rounded-xl border border-slate-300/80 bg-slate-100 p-1 shadow-inner">
              {(["Zone A", "Zone B"] as const).map((z) => {
                const active = activeZone === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setActiveZone(z);
                      setSelectedRideFilter("ALL");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                      active
                        ? "bg-white text-indigo-900 shadow-sm border border-slate-200"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Layers className={`h-3.5 w-3.5 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                    {z}
                  </button>
                );
              })}
            </div>

            {/* Export to Excel */}
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={exportMutation.isPending}
              className="h-9 gap-1.5 border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              {exportMutation.isPending ? "Building Excel..." : "Export Excel"}
            </Button>

            {/* Paste Message / Add Log Button */}
            <Button
              onClick={() => {
                const defaultRide = activeZone === "Zone A" ? "BWZ" : "ACR";
                setDraft({
                  ...blankLogDraft,
                  logDate: selectedCalendarDate || format(new Date(), "yyyy-MM-dd"),
                  zone: activeZone,
                  rideCode: defaultRide,
                });
                setCreateModalOpen(true);
              }}
              className="h-9 gap-1.5 bg-indigo-700 px-4 text-xs font-bold text-white shadow-md shadow-indigo-900/15 hover:bg-indigo-800"
            >
              <Plus className="h-4 w-4" />
              Add log
            </Button>
          </div>
        </header>

        {/* Filter bar: ride dropdown, status filter, keyword search */}
        <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search issues, missing bolts, RV disable, technician, or work notes..."
                className="h-9 border-slate-200 bg-slate-50/80 pl-9 text-xs focus-visible:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Ride filter */}
            <div className="flex items-center gap-2">
              <Label htmlFor="pm-ride-filter" className="text-xs font-bold text-slate-600 shrink-0">
                Ride:
              </Label>
              <Select value={selectedRideFilter} onValueChange={setSelectedRideFilter}>
                <SelectTrigger id="pm-ride-filter" className="h-9 w-[190px] text-xs font-bold border-slate-200 bg-white">
                  <SelectValue placeholder="All rides" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="ALL" className="text-xs font-extrabold text-indigo-900">
                    All {activeZone} Rides ({activeZoneRides.length})
                  </SelectItem>
                  {activeZoneRides.map(([code, name]) => (
                    <SelectItem key={code} value={code} className="text-xs">
                      <span className="font-bold text-slate-800">{code}</span> · {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-2">
              <Label htmlFor="pm-status-filter" className="text-xs font-bold text-slate-600 shrink-0">
                Status:
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="pm-status-filter" className="h-9 w-[150px] text-xs font-bold border-slate-200 bg-white">
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs font-bold">All Status</SelectItem>
                  <SelectItem value="Completed" className="text-xs text-emerald-700 font-bold">Completed</SelectItem>
                  <SelectItem value="Pending" className="text-xs text-amber-700 font-bold">Pending (Planning)</SelectItem>
                  <SelectItem value="In Progress" className="text-xs text-blue-700 font-bold">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset filters */}
            {(selectedRideFilter !== "ALL" || statusFilter !== "ALL" || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedRideFilter("ALL");
                  setStatusFilter("ALL");
                  setSearchQuery("");
                }}
                className="h-9 px-2 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Reset filters
              </Button>
            )}
          </div>
        </section>

        {/* Main Work Area: Monthly Calendar on Left, Selected Day Details on Right */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          {/* Calendar View */}
          <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
            {/* Calendar Controls */}
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-black text-[#27345e] flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-indigo-600" />
                  {format(currentMonth, "MMMM yyyy")}
                  <span className="text-xs font-normal text-slate-500">· {activeZone} Logs</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Top-left corner indicator displays 1% KPI downtime status (Blue: within KPI, Red: exceeded KPI).
                </p>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevMonth}
                  className="h-11 w-11 p-0 border-slate-300 bg-white"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="h-11 px-4 text-xs font-bold border-slate-300 bg-white"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextMonth}
                  className="h-11 w-11 p-0 border-slate-300 bg-white"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 md:hidden" aria-label="PM Tracker display mode">
              {(["calendar", "agenda"] as const).map(view => (
                <button key={view} type="button" onClick={() => setMobileView(view)} className={`min-h-10 flex-1 rounded-md px-3 text-xs font-bold capitalize transition-colors ${mobileView === view ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>
                  {view}
                </button>
              ))}
            </div>

            <div className={`${mobileView === "agenda" ? "" : "hidden"} space-y-2 md:hidden`} aria-label="PM Tracker monthly agenda">
              {mobileAgendaDays.length ? mobileAgendaDays.map(day => {
                const isSelected = selectedCalendarDate === day.dateStr;
                const downtime = reportDowntimeMap.get(day.dateStr);
                return (
                  <button
                    type="button"
                    key={day.dateStr}
                    onClick={() => setSelectedCalendarDate(day.dateStr)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      isSelected ? "border-indigo-600 bg-indigo-50" : day.isDarkDay ? "border-slate-300 bg-slate-100" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-[66px] shrink-0">
                      <p className="text-sm font-black text-slate-800">{format(parseISO(day.dateStr), "dd MMM")}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{format(parseISO(day.dateStr), "EEE")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      {day.isDarkDay ? (
                        <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200">Dark day</Badge>
                      ) : (
                        <p className="truncate text-xs font-bold text-slate-800">
                          {day.logs.length ? `${day.logs.length} PM log${day.logs.length === 1 ? "" : "s"} · ${day.logs[0].rideCode}` : "No PM log"}
                        </p>
                      )}
                      {day.logs.length > 0 && <p className="mt-0.5 truncate text-[11px] text-slate-500">{day.logs[0].summary || day.logs[0].message}</p>}
                    </div>
                    {downtime && (
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${downtime.isWithinKpi ? "bg-blue-100 text-blue-800" : "bg-rose-100 text-rose-800"}`}>
                        {downtime.totalDowntimePct.toFixed(2)}%
                      </span>
                    )}
                  </button>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-bold text-slate-700">No PM logs in this month</p>
                  <p className="mt-1 text-xs text-slate-500">Use Add log to begin the digital logbook.</p>
                </div>
              )}
            </div>

            {/* Desktop month grid (Monday to Sunday) */}
            <div className={`${mobileView === "calendar" ? "grid" : "hidden"} grid-cols-7 gap-1 border-b border-slate-200 pb-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 md:grid md:text-xs`}>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span className="text-indigo-600">Sat</span>
              <span className="text-indigo-600">Sun</span>
            </div>

            {/* Calendar Month Grid */}
            <div className={`${mobileView === "calendar" ? "grid" : "hidden"} mt-2 grid-cols-7 gap-1 md:grid md:gap-1.5`}>
              {calendarDays.map((day) => {
                const dayLogs = logsByDate.get(day.dateStr) || [];
                const isSelected = selectedCalendarDate === day.dateStr;
                const isDarkDay = darkDaySet.has(day.dateStr);
                const downtimeInfo = reportDowntimeMap.get(day.dateStr);

                // Top-left 1% KPI downtime indicator color
                let kpiCornerClass = "";
                let kpiTooltip = "";
                if (downtimeInfo) {
                  const pct = downtimeInfo.totalDowntimePct;
                  if (pct < 1.0) {
                    kpiCornerClass = "bg-blue-500";
                    kpiTooltip = `${pct.toFixed(2)}% • Within 1% KPI`;
                  } else if (pct < 2.0) {
                    kpiCornerClass = "bg-red-400";
                    kpiTooltip = `${pct.toFixed(2)}% • Exceeded KPI`;
                  } else if (pct < 3.0) {
                    kpiCornerClass = "bg-red-600";
                    kpiTooltip = `${pct.toFixed(2)}% • Exceeded KPI`;
                  } else {
                    kpiCornerClass = "bg-red-800";
                    kpiTooltip = `${pct.toFixed(2)}% • Critical downtime`;
                  }
                }

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => setSelectedCalendarDate(day.dateStr)}
                    className={`group relative flex min-h-[64px] md:min-h-[96px] lg:min-h-[110px] flex-col rounded-xl border p-1.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/70 shadow-md ring-2 ring-indigo-500/30"
                        : day.isCurrentMonth
                        ? isDarkDay
                          ? "border-slate-300 bg-slate-200/50 hover:bg-slate-200/80"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                        : "border-slate-100 bg-slate-50/40 opacity-40 hover:opacity-75"
                    }`}
                  >
                    {/* Top row: KPI corner indicator + Day Number + dark day / log badge */}
                    <div className="flex items-center justify-between w-full">
                      {/* 1% KPI downtime corner dot */}
                      {downtimeInfo ? (
                        <span
                          title={kpiTooltip}
                          className={`h-2.5 w-2.5 rounded-full ${kpiCornerClass} shadow-xs ring-1 ring-white shrink-0`}
                        />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0" />
                      )}

                      <span
                        className={`text-xs font-black ${
                          isSelected
                            ? "text-indigo-900"
                            : isDarkDay
                            ? "text-slate-700"
                            : "text-slate-800"
                        }`}
                      >
                        {day.date.getDate()}
                      </span>

                      {/* Log count badge if entries exist */}
                      {dayLogs.length > 0 ? (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white">
                          {dayLogs.length}
                        </span>
                      ) : isDarkDay ? (
                        <span className="rounded bg-slate-300 px-1 text-[8px] font-bold text-slate-700 uppercase">
                          Dark
                        </span>
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                    </div>

                    {/* Summarized entries snippet on calendar cell */}
                    <div className="mt-1 hidden flex-1 space-y-1 overflow-hidden md:block">
                      {dayLogs.slice(0, 2).map((item) => (
                        <div
                          key={item.id}
                          className={`rounded px-1 py-0.5 text-[10px] leading-tight truncate font-medium ${
                            item.status === "Pending"
                              ? "bg-amber-100 text-amber-900 border border-amber-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                          title={`${item.rideCode}: ${item.summary || item.message}`}
                        >
                          <span className="font-mono font-black text-indigo-700 mr-1">
                            {item.rideCode}
                          </span>
                          <span>{item.summary || item.message}</span>
                        </div>
                      ))}

                      {dayLogs.length > 2 && (
                        <p className="text-[9px] font-bold text-slate-400 pl-1">
                          +{dayLogs.length - 2} more...
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected Date Details Panel / Side Drawer */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    Day Details · {activeZone}
                  </p>
                  <h3 className="text-base font-black text-[#27345e]">
                    {format(parseISO(selectedCalendarDate), "EEEE, dd MMMM yyyy")}
                  </h3>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    const defaultRide = activeZone === "Zone A" ? "BWZ" : "ACR";
                    setDraft({
                      ...blankLogDraft,
                      logDate: selectedCalendarDate,
                      zone: activeZone,
                      rideCode: defaultRide,
                    });
                    setCreateModalOpen(true);
                  }}
                  className="h-8 gap-1 bg-indigo-700 text-xs font-bold text-white hover:bg-indigo-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add log
                </Button>
              </div>

              {/* KPI Banner if available for this day */}
              {reportDowntimeMap.has(selectedCalendarDate) && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-700">1% Rides KPI Downtime:</span>
                    <span
                      className={`font-mono font-black ${
                        reportDowntimeMap.get(selectedCalendarDate)!.isWithinKpi
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }`}
                    >
                      {reportDowntimeMap.get(selectedCalendarDate)!.totalDowntimePct.toFixed(2)}% (
                      {reportDowntimeMap.get(selectedCalendarDate)!.isWithinKpi ? "Within KPI" : "Exceeded"}
                      )
                    </span>
                  </div>
                </div>
              )}

              {/* Dark day indicator if marked */}
              {darkDaySet.has(selectedCalendarDate) && (
                <div className="mt-2 rounded-xl border border-slate-300 bg-slate-100 p-2 text-xs font-bold text-slate-700">
                  Marked as park Dark Day
                </div>
              )}

              {/* Log List for this selected date */}
              <div className="mt-4 space-y-3">
                {selectedDateLogs.length === 0 ? (
                  <div className="py-12 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-bold text-slate-600">
                      No PM logs recorded for this day
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Click "Add log" or "Add log" to insert.
                    </p>
                  </div>
                ) : (
                  selectedDateLogs.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setActiveDetailLog(item)}
                      className="group cursor-pointer rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-indigo-300 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-black text-indigo-900">
                            {item.rideCode}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{item.rideName}</span>
                        </div>

                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            item.status === "Completed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : item.status === "Pending"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-blue-200 bg-blue-50 text-blue-800"
                          }`}
                        >
                          {item.status}
                        </Badge>
                      </div>

                      <div className="mt-2">
                        <p className="text-xs font-extrabold text-[#24325e]">
                          {item.summary || item.workType}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                          {item.message}
                        </p>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3 text-slate-400" />
                          {item.workType}
                        </span>
                        {item.technician && (
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <UserCheck className="h-3 w-3 text-indigo-500" />
                            {item.technician}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* CREATE LOG / PASTE MESSAGE MODAL */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl"
          aria-describedby="pm-create-dialog-desc"
        >
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-black text-[#24325e]">
                  Add PM Tracker Log
                </DialogTitle>
                <DialogDescription id="pm-create-dialog-desc" className="mt-1 text-xs text-slate-500">
                  Record opening startup, closing inspection, OT, dark-day, rehab, or PM activity into the digital logbook.
                </DialogDescription>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {/* Date and Zone */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pm-log-date">Log date</Label>
                <Input
                  id="pm-log-date"
                  type="date"
                  value={draft.logDate}
                  onChange={(e) => setDraft((cur) => ({ ...cur, logDate: e.target.value }))}
                  className="mt-1.5 h-10 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="pm-log-zone">Zone</Label>
                <div
                  id="pm-log-zone"
                  className="mt-1.5 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700"
                >
                  {draft.zone}
                  <span className="ml-2 text-[10px] font-normal text-slate-400">(auto-assigned from ride)</span>
                </div>
              </div>
            </div>

            {/* Ride Selection */}
            <div>
              <Label htmlFor="pm-log-ride">Ride / Attraction</Label>
              <Select value={draft.rideCode} onValueChange={handleDraftRideChange}>
                <SelectTrigger id="pm-log-ride" className="mt-1.5 h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {FLEET_RIDES.map(([code, name]) => (
                    <SelectItem key={code} value={code} className="text-xs">
                      <span className="font-bold text-slate-800">{code}</span> · {name} (
                      {getRideZone(code)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Work Type & Status */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pm-work-type">Work type</Label>
                <Select
                  value={draft.workType}
                  onValueChange={(val: PmWorkType) =>
                    setDraft((cur) => ({ ...cur, workType: val }))
                  }
                >
                  <SelectTrigger id="pm-work-type" className="mt-1.5 h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PM_WORK_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pm-status">Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(val: PmStatus) =>
                    setDraft((cur) => ({ ...cur, status: val }))
                  }
                >
                  <SelectTrigger id="pm-status" className="mt-1.5 h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Completed">Completed (Job done)</SelectItem>
                    <SelectItem value="Pending">Pending / Planning (Not done yet)</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Technician In Charge */}
            <div>
              <Label htmlFor="pm-tech">Technician in charge / Staff responsible</Label>
              <Input
                id="pm-tech"
                value={draft.technician}
                onChange={(e) => setDraft((cur) => ({ ...cur, technician: e.target.value }))}
                placeholder="e.g. Mohd Hafiz, Firdaus (AM Shift Tech)"
                className="mt-1.5 h-10 text-xs"
              />
            </div>

            {/* Concise Summary (shown on calendar cell) */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pm-summary">Summarized title / Calendar label</Label>
                <span className="text-[11px] text-slate-400">Appears on calendar cell</span>
              </div>
              <Input
                id="pm-summary"
                value={draft.summary}
                onChange={(e) => setDraft((cur) => ({ ...cur, summary: e.target.value }))}
                placeholder="e.g. RV3 disabled, missing bolt pending, weekly PM completed"
                className="mt-1.5 h-10 text-xs"
              />
            </div>

            {/* Full Pasted WhatsApp Message */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pm-message">
                  Supervisor message / Full logbook details <span className="text-rose-500">*</span>
                </Label>
                <span className="text-[11px] text-indigo-600 font-semibold">Paste WhatsApp message here</span>
              </div>
              <Textarea
                id="pm-message"
                value={draft.message}
                onChange={(e) => setDraft((cur) => ({ ...cur, message: e.target.value }))}
                placeholder={"Paste WhatsApp message from supervisor or write startup/closing findings:\n\n'Morning OT 08/10/2026: BWZ RV2 sensor adjusted, found bolt missing on platform gate, yet to be replaced. Tech Hafiz.'"}
                className="mt-1.5 min-h-[120px] text-xs leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              className="bg-white text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveLog}
              disabled={createMutation.isPending}
              className="bg-indigo-700 text-xs font-bold text-white hover:bg-indigo-800"
            >
              {createMutation.isPending ? "Saving..." : "Save digital log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VIEW FULL LOG DETAIL DIALOG */}
      <Dialog open={!!activeDetailLog} onOpenChange={(open) => !open && setActiveDetailLog(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl"
          aria-describedby="pm-detail-dialog-desc"
        >
          {activeDetailLog && (
            <div>
              <DialogHeader className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-black text-indigo-900">
                        {activeDetailLog.rideCode}
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        {activeDetailLog.rideName}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-bold">
                        {activeDetailLog.zone}
                      </Badge>
                    </div>
                    <DialogTitle className="mt-2 text-lg font-black text-[#24325e]">
                      {activeDetailLog.summary || activeDetailLog.workType}
                    </DialogTitle>
                    <DialogDescription id="pm-detail-dialog-desc" className="mt-0.5 text-xs text-slate-500">
                      Logged for {activeDetailLog.logDate} · {activeDetailLog.workType}
                    </DialogDescription>
                  </div>

                  <button
                    onClick={() => setActiveDetailLog(null)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </DialogHeader>

              <div className="space-y-4 px-6 py-5 text-xs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                      Status
                    </p>
                    <p className="mt-1 font-extrabold text-slate-800 text-sm">
                      {activeDetailLog.status}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                      Technician In Charge
                    </p>
                    <p className="mt-1 font-extrabold text-slate-800 text-sm">
                      {activeDetailLog.technician || "Not specified"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1.5">
                    Supervisor Message / Raw WhatsApp Log
                  </p>
                  <p className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                    {activeDetailLog.message}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate({ id: activeDetailLog.id })}
                  disabled={deleteMutation.isPending}
                  className="gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete log
                </Button>

                <Button
                  size="sm"
                  onClick={() => setActiveDetailLog(null)}
                  className="bg-slate-700 text-white hover:bg-slate-800 text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
