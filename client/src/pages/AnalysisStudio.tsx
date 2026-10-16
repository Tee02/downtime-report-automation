import DashboardLayout from "@/components/DashboardLayout";
import { IncidentLogEntry } from "@/components/IncidentLogEntry";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { EditableText } from "@/contexts/TextEditContext";
import { FLEET_RIDES } from "@/components/RideCombinationSwitch";
import { trpc } from "@/lib/trpc";
import type { AnalysisResult, RideAnalysis } from "../../../server/downtimeAnalysis";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Gauge,
  History,
  Info,
  Layers3,
  Loader2,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type Tab = "overview" | "compare";
type Scenario = {
  id: "A" | "B" | "C";
  name: string;
  dateKeys: Set<string>;
  rideCodes: string[];
};

type CompareHistoryItem = {
  id: string;
  timestamp: number;
  label: string; // e.g. "TTC on 21/6 vs ACR on 21/6 – 23/6" or "TTC on 21/6"
  scenarioA: {
    name: string;
    dateKeys: string[];
    rideCodes: string[];
  };
  scenarioB: {
    name: string;
    dateKeys: string[];
    rideCodes: string[];
  };
};

const CARD_CLASS = "border-[#d8e2f4] bg-white shadow-sm transition-all";
const RIDE_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#4b5563", "#4338ca", "#047857",
  "#b45309", "#b91c1c", "#6d28d9", "#0e7490", "#be185d",
  "#374151", "#1d4ed8", "#0f766e", "#c2410c", "#991b1b",
  "#5b21b6",
];

function rideColor(index: number) {
  return RIDE_COLORS[index % RIDE_COLORS.length];
}

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
  weatherText?: string | null;
  createdAt: string | Date;
};

// Calendar widgets provide local browser dates. Keep all picker conversions in
// local calendar time so clicking the 8th never serializes as the 7th in UTC.
function asDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDate(dateKey: string): string {
  return asDate(dateKey).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dateWithWeekday(dateKey: string): string {
  return asDate(dateKey).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatDayMonth(dateKey: string): string {
  const date = asDate(dateKey);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function scenarioHistorySummary(rideCodes: string[], dateKeys: Set<string> | string[]): string {
  const keysArr = Array.isArray(dateKeys) ? dateKeys : Array.from(dateKeys);
  const sorted = [...keysArr].sort();
  const rideLabel = rideCodes.length === 1 ? rideCodes[0] : rideCodes.length > 1 ? `${rideCodes.length} rides` : "All rides";
  if (!sorted.length) return `${rideLabel} on —`;
  if (sorted.length === 1) {
    return `${rideLabel} on ${formatDayMonth(sorted[0])}`;
  }
  return `${rideLabel} on ${formatDayMonth(sorted[0])} – ${formatDayMonth(sorted[sorted.length - 1])}`;
}

function compactDateRange(dateKeys: Set<string>): string {
  const sorted = Array.from(dateKeys).sort();
  if (!sorted.length) return "No dates selected";
  if (sorted.length === 1) return dateWithWeekday(sorted[0]);
  return `${shortDate(sorted[0])} – ${shortDate(sorted[sorted.length - 1])} (${sorted.length} days)`;
}

function scopeLabel(rideCodes: string[]): string {
  if (!rideCodes.length) return "All 21 rides";
  if (rideCodes.length === 1) {
    const matched = FLEET_RIDES.find(([code]) => code === rideCodes[0]);
    return matched ? `${matched[0]} · ${matched[1]}` : rideCodes[0];
  }
  return `${rideCodes.length} selected rides`;
}

function deltaPercent(current?: number | null, baseline?: number | null): number | null {
  if (typeof current !== "number" || typeof baseline !== "number" || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function RideScopePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isAll = value.length === 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FLEET_RIDES;
    return FLEET_RIDES.filter(([code, name]) => code.toLowerCase().includes(q) || name.toLowerCase().includes(q));
  }, [search]);

  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter(item => item !== code));
    } else {
      onChange([...value, code]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`h-auto min-w-0 flex-1 justify-start gap-3 rounded-none px-5 py-3 text-left hover:bg-slate-50 ${
            compact ? "h-9 border border-[#c9d3ed] bg-white px-3 py-1.5" : ""
          }`}
        >
          <Layers3 className="h-5 w-5 shrink-0 text-[#1e4ca1]" />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Ride scope</span>
            <span className="block truncate text-sm font-extrabold text-[#172c5b]">{scopeLabel(value)}</span>
          </span>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] rounded-2xl border-[#adbBda]/80 bg-white p-3 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <p className="text-xs font-extrabold text-slate-900">Filter attraction scope</p>
          <Button variant="ghost" size="sm" onClick={() => onChange([])} className="h-6 px-1.5 text-[10px] text-slate-500">
            Select all
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search 21 attractions..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-bold transition-colors ${
              isAll ? "bg-blue-50 text-[#1e4ca1]" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>All 21 attractions</span>
            {isAll && <Check className="h-3.5 w-3.5 text-[#1e4ca1]" />}
          </button>
          {filtered.map(([code, name]) => {
            const active = value.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  active ? "bg-blue-50 font-bold text-[#1e4ca1]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">
                  <strong className="mr-1.5 font-mono">{code}</strong>
                  {name}
                </span>
                {active && <Check className="h-3.5 w-3.5 text-[#1e4ca1]" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MiniSparkline({ values, tone = "green" }: { values: number[]; tone?: "green" | "rose" }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.length > 1
    ? values.map((value, index) => `${(index / (values.length - 1)) * 100},${24 - ((value - min) / range) * 20}`).join(" ")
    : "0,15 100,15";
  return (
    <svg viewBox="0 0 100 28" aria-hidden="true" className="h-7 w-20 shrink-0">
      <polyline fill="none" stroke={tone === "green" ? "#20ad88" : "#dd4c7f"} strokeWidth="2" points={points} />
    </svg>
  );
}

function MetricCard({
  contentKey,
  label,
  value,
  detail,
  tone = "blue",
}: {
  contentKey: string;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "mint" | "amber" | "rose";
}) {
  const toneClass = {
    blue: "bg-blue-100 text-blue-800",
    mint: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  }[tone];
  return (
    <Card className={CARD_CLASS}>
      <CardContent className="p-4 sm:p-5">
        <EditableText contentKey={contentKey} defaultText={label} as="p" className="block text-xs font-bold text-slate-500" />
        <p className="mt-2 text-2xl font-extrabold tracking-tight text-[#162b5b]">{value}</p>
        <span className={`mt-3 inline-flex max-w-full rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClass}`}>{detail}</span>
      </CardContent>
    </Card>
  );
}

function DateRangePicker({
  availableDateKeys,
  selectedDateKeys,
  onChange,
  darkDays = [],
}: {
  availableDateKeys: string[];
  selectedDateKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  darkDays?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [rangeStartKey, setRangeStartKey] = useState<string | null>(null);
  const selected = useMemo(() => Array.from(selectedDateKeys).map(asDate), [selectedDateKeys]);
  const sorted = useMemo(() => Array.from(selectedDateKeys).sort(), [selectedDateKeys]);
  const rangeStart = rangeStartKey ? asDate(rangeStartKey) : sorted.length > 1 ? asDate(sorted[0]) : undefined;
  const rangeEnd = !rangeStartKey && sorted.length > 1 ? asDate(sorted[sorted.length - 1]) : undefined;
  const rangeMiddle = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [] as Date[];
    const dates: Date[] = [];
    const cursor = new Date(rangeStart);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < rangeEnd) { dates.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
    return dates;
  }, [rangeStart?.getTime(), rangeEnd?.getTime()]);

  const choose = (day: Date) => {
    const key = dateKey(day);
    if (!availableDateKeys.includes(key)) return;
    if (!rangeStartKey) {
      setRangeStartKey(key);
      onChange(new Set([key]));
      return;
    }
    const start = rangeStartKey < key ? rangeStartKey : key;
    const end = rangeStartKey < key ? key : rangeStartKey;
    onChange(new Set(availableDateKeys.filter(value => value >= start && value <= end)));
    setRangeStartKey(null);
  };

  const selectLastWeek = () => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(today.getDate() - mondayOffset - 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const startKey = dateKey(start); const endKey = dateKey(end);
    onChange(new Set(availableDateKeys.filter(key => key >= startKey && key <= endKey)));
    setRangeStartKey(null);
  };

  const selectLastMonth = () => {
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prefix = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    onChange(new Set(availableDateKeys.filter(key => key.startsWith(prefix))));
    setRangeStartKey(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-none px-5 py-3 text-left hover:bg-slate-50">
          <CalendarDays className="h-5 w-5 shrink-0 text-[#1e4ca1]" />
          <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Date range</span><span className="block truncate text-sm font-extrabold text-[#172c5b]">{compactDateRange(selectedDateKeys)}</span></span>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[350px] rounded-2xl border-[#adbBda]/80 bg-white p-3 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div><p className="text-xs font-extrabold text-slate-900">Choose reporting dates</p><p className="text-[10px] text-slate-500">Click a start date, then an end date.</p></div>
          <Button variant="ghost" size="sm" onClick={() => { setRangeStartKey(null); onChange(new Set()); }} className="h-7 px-2 text-[10px] text-slate-500">Clear all</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="outline" size="sm" onClick={selectLastWeek} className="h-6 px-2 text-[10px] font-bold text-[#1e4ca1]">Last Week</Button>
          <Button variant="outline" size="sm" onClick={selectLastMonth} className="h-6 px-2 text-[10px] font-bold text-[#1e4ca1]">Last Month</Button>
          <Button variant="outline" size="sm" onClick={() => { onChange(new Set(availableDateKeys)); setRangeStartKey(null); }} className="h-6 px-2 text-[10px] font-bold text-[#1e4ca1]">All saved</Button>
        </div>
        {rangeStartKey && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Start date: {shortDate(rangeStartKey)}. Select an end date.</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky-500" /> Saved log</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-slate-400 border border-slate-500" /> Dark day</span>
        </div>
        <div className="mt-2 flex justify-center">
          <Calendar
            mode="multiple"
            selected={selected}
            onDayClick={choose}
            disabled={day => !availableDateKeys.includes(dateKey(day))}
            weekStartsOn={1}
            modifiers={{
              savedLog: availableDateKeys.map(asDate),
              darkDay: darkDays.map(asDate),
              rangePending: rangeStartKey ? [asDate(rangeStartKey)] : [],
              range_start: rangeStart ? [rangeStart] : [],
              range_end: rangeEnd ? [rangeEnd] : [],
              range_middle: rangeMiddle,
            }}
            className="w-full rounded-xl bg-[#f8faff] p-2"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedSourceManager({
  open,
  onOpenChange,
  reports,
  onDelete,
  deleting,
  darkDays,
  onToggleDarkDay,
  updatingDarkDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: SavedReport[];
  onDelete: (id: number) => void;
  deleting: boolean;
  darkDays: string[];
  onToggleDarkDay: (dateKey: string, isDarkDay: boolean) => void;
  updatingDarkDay: boolean;
}) {
  const reportDates = useMemo(() => Array.from(new Set(reports.map(report => report.reportDate))).sort(), [reports]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | undefined>();
  useEffect(() => {
    if (!selectedDate && reportDates.length) setSelectedDate(reportDates[reportDates.length - 1]);
  }, [selectedDate, reportDates]);
  const reportsOnDate = reports.filter(report => report.reportDate === selectedDate);
  useEffect(() => { if (reportsOnDate.length && !reportsOnDate.some(report => report.id === selectedId)) setSelectedId(reportsOnDate[0].id); }, [selectedDate, reportsOnDate.length, selectedId]);
  const selected = reportsOnDate.find(report => report.id === selectedId);
  const isDarkDay = selectedDate ? darkDays.includes(selectedDate) : false;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-[#d6def0] bg-[#f6f8ff] p-0 sm:max-w-[390px]">
        <SheetHeader className="border-b border-[#d6def0] bg-white px-6 py-5"><SheetTitle className="text-left text-xl font-extrabold text-[#172c5b]">Saved source reports</SheetTitle><SheetDescription className="text-left text-xs">Select a saved report date to manage it.</SheetDescription></SheetHeader>
        <div className="space-y-4 p-4">
          <Card className="border-[#d5dff3] bg-white shadow-sm"><CardContent className="p-3"><Calendar mode="single" selected={selectedDate ? asDate(selectedDate) : undefined} onDayClick={day => { const key = dateKey(day); if (reportDates.includes(key)) setSelectedDate(key); }} weekStartsOn={1} modifiers={{ savedLog: reportDates.map(asDate), darkDay: darkDays.map(asDate) }} className="w-full rounded-xl bg-[#f8faff] p-2" /><div className="mt-2 flex flex-wrap gap-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-slate-500" />Dark day</span><span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-blue-100 ring-1 ring-blue-300" />Selected reporting date</span></div></CardContent></Card>
          {reportsOnDate.length > 1 && <div className="space-y-1">{reportsOnDate.map(report => <button type="button" key={report.id} onClick={() => setSelectedId(report.id)} className={`w-full rounded-lg border p-2 text-left text-xs ${selectedId === report.id ? "border-[#1e4ca1] bg-blue-50" : "border-slate-200 bg-white"}`}><strong className="block truncate">{report.sourceFileName}</strong><span className="text-slate-500">{report.totalTechnicalMinutes} min technical downtime</span></button>)}</div>}
          {selected ? <Card className="border-[#d5dff3] bg-white shadow-sm"><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><Badge className="bg-blue-100 text-[#1e4ca1] hover:bg-blue-100">{shortDate(selected.reportDate)}</Badge><span className="text-[10px] font-bold text-slate-500">All rides</span></div><p className="truncate text-xs font-semibold text-slate-600">{selected.sourceFileName}</p><div className="grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-center"><div><p className="text-[10px] text-slate-500">Downtime</p><p className="mt-1 text-xs font-extrabold text-[#172c5b]">{selected.totalTechnicalMinutes} min</p></div><div><p className="text-[10px] text-slate-500">Availability</p><p className="mt-1 text-xs font-extrabold text-[#172c5b]">{Math.max(0, 100 - selected.totalNetworkPercentage).toFixed(2)}%</p></div><div><p className="text-[10px] text-slate-500">Events</p><p className="mt-1 text-xs font-extrabold text-[#172c5b]">Saved log</p></div></div><Button type="button" variant="outline" onClick={() => onDelete(selected.id)} disabled={deleting} className="h-9 w-full border-rose-300 text-rose-700 hover:bg-rose-50">{deleting ? "Deleting…" : "Delete saved log"}</Button></CardContent></Card> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">Choose a marked date to manage its file.</div>}
          <Card className="border-[#d5dff3] bg-white shadow-sm"><CardContent className="p-4"><h3 className="text-sm font-extrabold text-[#172c5b]">Dark day management</h3><div className="mt-3 flex items-center gap-3"><CalendarDays className="h-4 w-4 text-[#1e4ca1]" /><span className="flex-1 text-xs font-semibold text-slate-700">Mark as dark day</span><Switch checked={isDarkDay} disabled={!selectedDate || updatingDarkDay} onCheckedChange={checked => selectedDate && onToggleDarkDay(selectedDate, checked)} aria-label="Mark selected date as dark day" /></div><div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] text-slate-500">Marked dark days</p><div className="mt-1.5 flex flex-wrap gap-1.5">{darkDays.length ? darkDays.slice(-5).map(key => <Badge key={key} className="bg-slate-600 text-white hover:bg-slate-600">{shortDate(key)}</Badge>) : <span className="text-[10px] text-slate-400">None marked</span>}</div></div></CardContent></Card>
          <div className="flex gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800"><Info className="mt-0.5 h-4 w-4 shrink-0" />Dark days sync across Date range, KPI Calendar, and saved-log selection.</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type KpiAgendaStatus = {
  label: string;
  badgeClass: string;
  detail: string;
};

function getKpiAgendaStatus(percentage: number): KpiAgendaStatus {
  if (percentage < 1) {
    return { label: "Within KPI", badgeClass: "bg-blue-100 text-blue-800", detail: "Within 1% KPI" };
  }
  if (percentage < 2) {
    return { label: "Monitor", badgeClass: "bg-rose-100 text-rose-800", detail: "1.00% – 1.99% downtime" };
  }
  if (percentage < 3) {
    return { label: "Escalate", badgeClass: "bg-rose-200 text-rose-900", detail: "2.00% – 2.99% downtime" };
  }
  return { label: "Critical", badgeClass: "bg-rose-800 text-white", detail: "3.00%+ downtime" };
}

// KPI Calendar component with multi-level heatmap coloring and tooltips
function KpiCalendarPanel({
  reports = [],
  darkDays = [],
  monthDate,
  scope,
}: {
  reports: SavedReport[];
  darkDays: string[];
  monthDate?: Date;
  scope: string;
}) {
  const [currentMonth, setCurrentMonth] = useState<Date>(monthDate || new Date());
  // Calendar is the field default on handheld screens; Agenda is optional.
  const [mobileView, setMobileView] = useState<"calendar" | "agenda">("calendar");

  useEffect(() => {
    if (monthDate) setCurrentMonth(monthDate);
  }, [monthDate?.getTime()]);

  // Memoized map of dateKey -> totalNetworkPercentage across ALL saved reports
  const reportDowntimeMap = useMemo(() => {
    const map = new Map<string, number>();
    reports.forEach(r => {
      map.set(r.reportDate, r.totalNetworkPercentage);
    });
    return map;
  }, [reports]);

  // Calculate days for current visible month to identify days with no log uploaded
  const monthData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth(); // 0-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const kpiWithin: Date[] = [];
    const kpiLightRed: Date[] = [];
    const kpiDarkRed: Date[] = [];
    const kpiDeepRed: Date[] = [];
    const noLogDates: Date[] = [];
    const darkDayDates: Date[] = [];
    const tooltipModifiers: Record<string, Date[]> = {};

    const darkDaySet = new Set(darkDays);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKeyStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const d = asDate(dateKeyStr);

      if (darkDaySet.has(dateKeyStr)) {
        darkDayDates.push(d);
        const tKey = `tooltip_${encodeURIComponent("Dark day")}`;
        if (!tooltipModifiers[tKey]) tooltipModifiers[tKey] = [];
        tooltipModifiers[tKey].push(d);
        continue;
      }

      if (reportDowntimeMap.has(dateKeyStr)) {
        const pct = reportDowntimeMap.get(dateKeyStr)!;
        const rounded = pct.toFixed(2);
        // Keep the hover label concise: the cell color already conveys KPI severity.
        const tip = `${rounded}%`;

        if (pct < 1.0) {
          kpiWithin.push(d);
        } else if (pct < 2.0) {
          kpiLightRed.push(d);
        } else if (pct < 3.0) {
          kpiDarkRed.push(d);
        } else {
          kpiDeepRed.push(d);
        }

        const tKey = `tooltip_${encodeURIComponent(tip)}`;
        if (!tooltipModifiers[tKey]) tooltipModifiers[tKey] = [];
        tooltipModifiers[tKey].push(d);
      } else {
        noLogDates.push(d);
        const tKey = `tooltip_${encodeURIComponent("No log detected")}`;
        if (!tooltipModifiers[tKey]) tooltipModifiers[tKey] = [];
        tooltipModifiers[tKey].push(d);
      }
    }

    return {
      kpiWithin,
      kpiLightRed,
      kpiDarkRed,
      kpiDeepRed,
      noLogDates,
      darkDayDates,
      tooltipModifiers,
    };
  }, [currentMonth, reportDowntimeMap, darkDays]);

  const mobileAgendaRows = useMemo(() => {
    const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
    const darkDaySet = new Set(darkDays);
    const rows = new Set<string>([
      ...reports.filter(report => report.reportDate.startsWith(prefix)).map(report => report.reportDate),
      ...darkDays.filter(day => day.startsWith(prefix)),
    ]);

    return Array.from(rows)
      .sort()
      .map(dateKey => {
        if (darkDaySet.has(dateKey)) {
          return { dateKey, kind: "dark" as const, percentage: null, status: null };
        }
        const percentage = reportDowntimeMap.get(dateKey) ?? 0;
        return { dateKey, kind: "report" as const, percentage, status: getKpiAgendaStatus(percentage) };
      });
  }, [currentMonth, reports, darkDays, reportDowntimeMap]);

  return (
    <Card className={`${CARD_CLASS} h-full`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <EditableText
              contentKey="overview_calendar_title"
              defaultText="KPI Calendar"
              as="h2"
              className="block text-lg font-extrabold tracking-tight text-[#172c5b]"
            />
            <EditableText
              contentKey="overview_calendar_desc"
              defaultText="Spot if everyday is within 1% KPI percentage."
              as="p"
              className="mt-1 block text-xs text-slate-500"
            />
          </div>
          <CalendarDays className="h-5 w-5 text-[#1e4ca1]" />
        </div>

        {/* Heatmap Legend */}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[9px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-[#5793f5]" />
            0% – 0.99% (Within KPI)
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-[#ff7b89]" />
            1.00% – 1.99%
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-[#e03a52]" />
            2.00% – 2.99%
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-[#9e0c24]" />
            3.00%+
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-slate-400 border border-slate-500" />
            Dark day
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-sm bg-slate-200 border border-slate-300" />
            No log detected
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentMonth(value => new Date(value.getFullYear(), value.getMonth() - 1, 1))}
            className="h-11 w-11 shrink-0 border-slate-300 bg-white p-0"
            aria-label="Previous KPI month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-0 flex-1 text-center text-sm font-extrabold text-slate-800">
            {currentMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentMonth(value => new Date(value.getFullYear(), value.getMonth() + 1, 1))}
            className="h-11 w-11 shrink-0 border-slate-300 bg-white p-0"
            aria-label="Next KPI month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 md:hidden" aria-label="KPI display mode">
          {(["calendar", "agenda"] as const).map(view => (
            <button key={view} type="button" onClick={() => setMobileView(view)} className={`min-h-10 flex-1 rounded-md px-3 text-xs font-bold capitalize transition-colors ${mobileView === view ? "bg-white text-[#1e4ca1] shadow-sm" : "text-slate-600"}`}>
              {view}
            </button>
          ))}
        </div>

        <div className={`${mobileView === "agenda" ? "" : "hidden"} mt-3 space-y-2 md:hidden`} aria-label="KPI reporting day agenda">
          {mobileAgendaRows.length ? mobileAgendaRows.map(row => (
            <div key={row.dateKey} className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="w-20 shrink-0">
                <p className="text-xs font-extrabold text-slate-800">{dateWithWeekday(row.dateKey)}</p>
              </div>
              {row.kind === "dark" ? (
                <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200">Dark day</Badge>
              ) : (
                <>
                  <Badge className={row.status!.badgeClass}>{row.status!.label}</Badge>
                  <span className="ml-auto text-right text-xs font-extrabold text-slate-800">{row.percentage!.toFixed(2)}%</span>
                </>
              )}
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
              No saved log or dark day is recorded in this month.
            </div>
          )}
        </div>

        <div className={`${mobileView === "calendar" ? "flex" : "hidden"} mt-3 justify-center md:hidden`}>
          <Calendar
            mode="single"
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            weekStartsOn={1}
            modifiers={{
              kpiWithin: monthData.kpiWithin,
              kpiLightRed: monthData.kpiLightRed,
              kpiDarkRed: monthData.kpiDarkRed,
              kpiDeepRed: monthData.kpiDeepRed,
              noLog: monthData.noLogDates,
              darkDay: monthData.darkDayDates,
              ...monthData.tooltipModifiers,
            }}
            className="w-full rounded-xl bg-[#f8faff] p-2"
          />
        </div>

        <div className="mt-3 hidden justify-center md:flex">
          <Calendar
            mode="single"
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            weekStartsOn={1}
            modifiers={{
              kpiWithin: monthData.kpiWithin,
              kpiLightRed: monthData.kpiLightRed,
              kpiDarkRed: monthData.kpiDarkRed,
              kpiDeepRed: monthData.kpiDeepRed,
              noLog: monthData.noLogDates,
              darkDay: monthData.darkDayDates,
              ...monthData.tooltipModifiers,
            }}
            className="w-full rounded-xl bg-[#f8faff] p-2"
          />
        </div>

        <div className="mt-2 hidden items-center justify-between border-t border-slate-100 pt-3 text-[10px] md:flex">
          <Badge className="bg-blue-50 text-[#1e4ca1] hover:bg-blue-50">{scope}</Badge>
          <span className="flex items-center gap-1 text-slate-400">
            <CalendarDays className="h-3 w-3" />
            Interactive heat map across all dates
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Split bar chart & Pie chart Tooltip in the exact format:
// "ride • total time • number of incident • percentage of that particular ride"
// e.g. "RTR • 12min • 1 inc • 2.5%"
function RideDowntimeTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  // With stacked bars, shared=false sends the exact segment under the cursor.
  const item = payload.find((entry: any) => Number(entry?.value) > 0) || payload[0];
  const data = item?.payload || {};
  const rideCode = data.rideCode || item?.dataKey || item?.name || "Ride";
  const metadata = data.rideMeta?.[rideCode] || data;
  const minutes = metadata.minutes ?? item?.value ?? 0;
  const events = metadata.events ?? data.events ?? data.incidents ?? 1;
  const percentageValue = metadata.percentage ?? data.percentage ?? 0;
  const percentage = Number(percentageValue).toFixed(1);

  return (
    <div className="rounded-lg bg-[#18366e] px-3 py-2 text-xs font-bold text-white shadow-xl">
      {rideCode} • {minutes}min • {events} inc • {percentage}%
    </div>
  );
}

function TrendPanel({ analysis }: { analysis: AnalysisResult }) {
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const isSingleDay = analysis.selectedDayCount === 1;

  // Single day breakdown (rides that experienced technical downtime)
  const singleDayRides = useMemo(() => {
    if (!isSingleDay) return [];
    const day = analysis.dailyTrend[0];
    if (day?.rideBreakdown && day.rideBreakdown.length > 0) {
      return day.rideBreakdown;
    }
    // Fallback from topRides
    return analysis.topRides
      .filter(r => r.minutes > 0)
      .map(r => ({
        rideCode: r.rideCode,
        attraction: r.attraction,
        minutes: r.minutes,
        events: r.events,
        percentage: r.downtimePercentage,
      }))
      .sort((a, b) => a.minutes - b.minutes); // ascending (shortest on top, longest on bottom)
  }, [isSingleDay, analysis]);

  // Recharts lays the first stacked Bar at the bottom. Render the longest ride
  // first so the thickest segment sits on the baseline and the shortest sits on top.
  const stackedRides = useMemo(
    () => [...singleDayRides].sort((a, b) => b.minutes - a.minutes),
    [singleDayRides]
  );
  const rideFillByCode = useMemo(
    () => new Map([...singleDayRides].sort((a, b) => a.minutes - b.minutes).map((ride, index) => [ride.rideCode, rideColor(index)])),
    [singleDayRides]
  );

  // Data for a single stacked daily bar. Ride metadata lets the hover tooltip
  // report the exact hovered segment rather than the aggregate stack.
  const singleBarData = useMemo(() => {
    if (!isSingleDay || !stackedRides.length) return [];
    const dateLabel = analysis.dailyTrend[0]?.label || "Selected Day";
    const barObj: any = { label: dateLabel, rideMeta: {} };
    stackedRides.forEach(ride => {
      barObj[ride.rideCode] = ride.minutes;
      barObj.rideMeta[ride.rideCode] = ride;
    });
    return [barObj];
  }, [isSingleDay, stackedRides, analysis]);

  // Data for multi-day rolling trend
  const multiDayData = useMemo(() => {
    return analysis.dailyTrend.map(d => ({
      dateKey: d.dateKey,
      label: d.label,
      minutes: d.minutes,
      percentage: d.percentage,
    }));
  }, [analysis.dailyTrend]);

  // Pie chart data: rides breakdown
  const pieData = useMemo(() => {
    if (isSingleDay) {
      return singleDayRides.map((r, idx) => ({
        name: r.rideCode,
        rideCode: r.rideCode,
        attraction: r.attraction,
        value: r.minutes,
        minutes: r.minutes,
        events: r.events,
        percentage: r.percentage,
        fill: rideColor(idx),
      }));
    }
    return analysis.topRides
      .filter(r => r.minutes > 0)
      .map((r, idx) => ({
        name: r.rideCode,
        rideCode: r.rideCode,
        attraction: r.attraction,
        value: r.minutes,
        minutes: r.minutes,
        events: r.events,
        percentage: r.downtimePercentage,
        fill: rideColor(idx),
      }));
  }, [isSingleDay, singleDayRides, analysis.topRides]);

  return (
    <Card className={CARD_CLASS}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <EditableText
              contentKey="overview_trend_title"
              defaultText="Technical downtime trend"
              as="h2"
              className="block text-lg font-extrabold tracking-tight text-[#172c5b]"
            />
            <p className="mt-1 text-xs text-slate-500">
              {isSingleDay
                ? "Attractions affected on selected date."
                : "Daily Technical 11-1 downtime by severity and ride contribution."}
            </p>
          </div>

          {/* 3 tabs: Bar chart, Line chart, Pie chart */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setChartType("bar")}
              className={`min-h-11 rounded-md px-3 text-[10px] font-extrabold transition-all ${
                chartType === "bar" ? "bg-[#243b6b] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Bar chart
            </button>
            <button
              type="button"
              onClick={() => setChartType("line")}
              className={`min-h-11 rounded-md px-3 text-[10px] font-extrabold transition-all ${
                chartType === "line" ? "bg-[#243b6b] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Line chart
            </button>
            <button
              type="button"
              onClick={() => setChartType("pie")}
              className={`min-h-11 rounded-md px-3 text-[10px] font-extrabold transition-all ${
                chartType === "pie" ? "bg-[#243b6b] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pie chart
            </button>
          </div>
        </div>

        {/* Legend / Info bar */}
        {chartType === "pie" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
            {pieData.map(p => (
              <span key={p.name} className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
                {p.name} ({p.minutes}m)
              </span>
            ))}
          </div>
        ) : isSingleDay && chartType === "bar" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
            <span className="text-slate-400">Longest at bottom, shortest on top:</span>
            {singleDayRides.map(r => (
              <span key={r.rideCode} className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full" style={{ background: rideFillByCode.get(r.rideCode) }} />
                {r.rideCode} ({r.minutes}m)
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#5793f5]" />0–29 min</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-yellow-400" />30–59 min</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" />60–119 min</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" />120+ min</span>
          </div>
        )}

        <div className="mt-3 h-[290px]" aria-label="Technical downtime trend chart">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "pie" ? (
              <PieChart>
                <Tooltip content={<RideDowntimeTooltip />} />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={35}
                  paddingAngle={2}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            ) : chartType === "bar" && isSingleDay ? (
              /* Single day stacked bar chart split by affected rides with longest downtime at bottom */
              <BarChart data={singleBarData} margin={{ top: 8, right: 12, bottom: 2, left: -8 }}>
                <CartesianGrid vertical={false} stroke="#dbe3f4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c6b88" }} />
                <YAxis tickLine={false} axisLine={false} width={42} tick={{ fontSize: 10, fill: "#5c6b88" }} unit="m" />
                <Tooltip content={<RideDowntimeTooltip />} shared={false} cursor={{ fill: "#c7d2fe", fillOpacity: 0.34 }} wrapperStyle={{ zIndex: 20, pointerEvents: "none" }} />
                {stackedRides.map((ride, index) => (
                  <Bar
                    key={ride.rideCode}
                    dataKey={ride.rideCode}
                    name={ride.rideCode}
                    stackId="rides"
                    fill={rideFillByCode.get(ride.rideCode)}
                    activeBar={{ stroke: "#172c5b", strokeWidth: 1.5 }}
                    radius={index === stackedRides.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : chartType === "bar" ? (
              /* Multi-day bar chart */
              <BarChart data={multiDayData} margin={{ top: 8, right: 12, bottom: 2, left: -8 }}>
                <CartesianGrid vertical={false} stroke="#dbe3f4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#5c6b88" }} />
                <YAxis tickLine={false} axisLine={false} width={42} tick={{ fontSize: 10, fill: "#5c6b88" }} unit="m" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-[#18366e] px-3 py-2 text-xs font-bold text-white shadow-xl">
                        {item.label || label} • {item.minutes}min • {Number(item.percentage).toFixed(1)}%
                      </div>
                    );
                  }}
                  cursor={{ fill: "#dce8fc", fillOpacity: 0.45 }}
                />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                  {multiDayData.map(point => {
                    const color = point.minutes < 30 ? "#5793f5" : point.minutes < 60 ? "#eab308" : point.minutes < 120 ? "#f97316" : "#ef4444";
                    return <Cell key={point.dateKey} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            ) : (
              /* Line chart */
              <LineChart data={multiDayData} margin={{ top: 8, right: 12, bottom: 2, left: -8 }}>
                <CartesianGrid vertical={false} stroke="#dbe3f4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#5c6b88" }} />
                <YAxis tickLine={false} axisLine={false} width={42} tick={{ fontSize: 10, fill: "#5c6b88" }} unit="m" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-[#18366e] px-3 py-2 text-xs font-bold text-white shadow-xl">
                        {item.label || label} • {item.minutes}min • {Number(item.percentage).toFixed(1)}%
                      </div>
                    );
                  }}
                  cursor={{ stroke: "#1e4ca1", strokeDasharray: "4 4", strokeWidth: 1.5 }}
                />
                <Line type="monotone" dataKey="minutes" stroke="#5793f5" strokeWidth={2.5} dot={{ r: 4, fill: "#5793f5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function RankingPanel({ analysis }: { analysis: AnalysisResult }) {
  return (
    <Card className={`${CARD_CLASS} h-full`}><CardContent className="p-5"><div className="flex items-center justify-between"><EditableText contentKey="overview_ranking_title" defaultText="Ride ranking" as="h2" className="block text-lg font-extrabold tracking-tight text-[#172c5b]" /><Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">Lowest availability first</Badge></div><div className="mt-3 max-h-[230px] overflow-y-scroll rounded-lg border border-[#e1e7f4]"><table className="w-full min-w-[500px] text-left text-xs"><thead className="sticky top-0 bg-[#f3f6fd] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Ride</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Availability</th><th className="px-3 py-2">Downtime</th><th className="px-3 py-2">Events</th></tr></thead><tbody className="divide-y divide-slate-100">{analysis.topRides.map((ride, index) => <tr key={ride.rideCode}><td className="px-3 py-2.5 font-extrabold text-[#1e4ca1]">{index + 1}</td><td className="px-3 py-2.5 font-mono font-extrabold text-[#172c5b]">{ride.rideCode}</td><td className="px-3 py-2.5 text-slate-600">{ride.downtimePercentage.toFixed(2)}%</td><td className="px-3 py-2.5 font-bold text-[#172c5b]">{ride.availabilityPercentage.toFixed(2)}%</td><td className="px-3 py-2.5 text-slate-700">{ride.minutes} min</td><td className="px-3 py-2.5"><Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">{ride.events}</Badge></td></tr>)}</tbody></table></div></CardContent></Card>
  );
}

function IncidentLogs({
  analysis,
  copied,
  onCopy,
}: {
  analysis: AnalysisResult;
  copied: boolean;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`${CARD_CLASS} overflow-hidden rounded-xl border bg-white/90`}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-4 text-left"><span className="rounded-lg bg-blue-50 p-2 text-[#1e4ca1]"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><EditableText contentKey="overview_incidents_title" defaultText="Ride Incident Logs" as="span" className="block text-base font-extrabold tracking-tight text-[#172c5b]" /><EditableText contentKey="overview_incidents_desc" defaultText="Scroll to review chronological incident remarks." as="span" className="mt-0.5 block text-xs text-slate-500" /></span><ChevronDown className={`h-4 w-4 text-[#1e4ca1] transition-transform ${open ? "rotate-180" : ""}`} /></CollapsibleTrigger>
      <CollapsibleContent className="border-t border-slate-100 px-5 pb-5 pt-4 sm:px-6">
        <div className="flex items-center justify-end gap-2.5">
          <Button size="sm" onClick={onCopy} className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy for Excel"}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {analysis.rideIncidentGroups.length ? (
            <div className="space-y-4 divide-y divide-slate-200">
              {analysis.rideIncidentGroups.map(group => (
                <div key={group.rideCode} className="space-y-1.5 pt-3 first:pt-0">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <span>
                      <strong className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs text-[#172c5b]">
                        {group.rideCode}
                      </strong>
                      <span className="ml-2 text-xs font-bold text-slate-700">{group.attraction}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">{group.logs.length} events</span>
                  </div>
                  <div className="space-y-1 pl-1">
                    {group.logs.map(log => (
                      <IncidentLogEntry
                        key={log.id}
                        kind={log.kind}
                        dateLabel={log.dateLabel}
                        description={log.description}
                        durationLabel={log.durationLabel}
                        timeRange={log.timeRange}
                        evacuationLabel={log.evacuationLabel}
                        evacuationRange={log.evacuationRange}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-500">No incident logs match this selection.</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScenarioCard({
  scenario,
  availableDateKeys,
  onChange,
}: {
  scenario: Scenario;
  availableDateKeys: string[];
  onChange: (scenario: Scenario) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const sorted = useMemo(() => Array.from(scenario.dateKeys).sort(), [scenario.dateKeys]);
  const startObj = rangeStart ? asDate(rangeStart) : sorted.length > 1 ? asDate(sorted[0]) : undefined;
  const endObj = !rangeStart && sorted.length > 1 ? asDate(sorted[sorted.length - 1]) : undefined;
  const middle = useMemo(() => { if (!startObj || !endObj) return [] as Date[]; const values: Date[] = []; const cursor = new Date(startObj); cursor.setDate(cursor.getDate() + 1); while (cursor < endObj) { values.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); } return values; }, [startObj?.getTime(), endObj?.getTime()]);
  const chooseDate = (day: Date) => { const key = dateKey(day); if (!availableDateKeys.includes(key)) return; if (!rangeStart) { setRangeStart(key); onChange({ ...scenario, dateKeys: new Set([key]) }); return; } const start = rangeStart < key ? rangeStart : key; const end = rangeStart < key ? key : rangeStart; onChange({ ...scenario, dateKeys: new Set(availableDateKeys.filter(value => value >= start && value <= end)) }); setRangeStart(null); setDateOpen(false); };
  const accent = scenario.id === "A" ? "bg-[#4f8df6]" : scenario.id === "B" ? "bg-[#f4ba3c]" : "bg-slate-500";
  return (
    <Card className={`${CARD_CLASS} overflow-visible`}><CardContent className="p-4"><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white ${accent}`}>{scenario.id}</span>{editing ? <Input value={scenario.name} onChange={event => onChange({ ...scenario, name: event.target.value })} onBlur={() => setEditing(false)} onKeyDown={event => event.key === "Enter" && setEditing(false)} autoFocus className="h-7 text-sm font-extrabold" /> : <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-[#172c5b]">{scenario.name}</span>}<Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`Edit ${scenario.name} name`} className="h-7 w-7 text-[#172c5b]"><Pencil className="h-3.5 w-3.5" /></Button></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Popover open={dateOpen} onOpenChange={setDateOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 justify-between border-[#c9d3ed] bg-white text-xs font-bold text-[#172c5b]"><span className="flex min-w-0 items-center gap-1.5 truncate"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#1e4ca1]" />{scenario.dateKeys.size ? compactDateRange(scenario.dateKeys) : "Select date range"}</span><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[330px] rounded-2xl border-[#adbBda]/80 bg-white p-3 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 pb-2"><span className="text-xs font-bold">Select reporting dates</span><Button size="sm" variant="ghost" onClick={() => { setRangeStart(null); onChange({ ...scenario, dateKeys: new Set() }); }} className="h-6 px-1.5 text-[10px] text-slate-500">Clear</Button></div>{rangeStart && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800">Start: {shortDate(rangeStart)}. Select end date.</p>}<div className="mt-2 flex justify-center"><Calendar mode="multiple" selected={Array.from(scenario.dateKeys).map(asDate)} onDayClick={chooseDate} disabled={day => !availableDateKeys.includes(dateKey(day))} weekStartsOn={1} modifiers={{ savedLog: availableDateKeys.map(asDate), rangePending: rangeStart ? [asDate(rangeStart)] : [], range_start: startObj ? [startObj] : [], range_end: endObj ? [endObj] : [], range_middle: middle }} className="rounded-xl bg-[#f8faff] p-2" /></div></PopoverContent></Popover><RideScopePicker value={scenario.rideCodes} onChange={rideCodes => onChange({ ...scenario, rideCodes })} compact /></div></CardContent></Card>
  );
}

function CompareVisualTrend({
  analysis,
  chartType,
  title,
  tone,
}: {
  analysis?: AnalysisResult | null;
  chartType: "bar" | "line" | "pie";
  title: string;
  tone: "blue" | "amber";
}) {
  const stroke = tone === "blue" ? "#5793f5" : "#f4ba3c";
  const data = analysis?.dailyTrend ?? [];

  const pieData = useMemo(() => {
    if (!analysis) return [];
    return analysis.topRides
      .filter(r => r.minutes > 0)
      .map((r, idx) => ({
        name: r.rideCode,
        rideCode: r.rideCode,
        attraction: r.attraction,
        value: r.minutes,
        minutes: r.minutes,
        events: r.events,
        percentage: r.downtimePercentage,
        fill: rideColor(idx),
      }));
  }, [analysis]);
  const rideBarData = useMemo(() => pieData.slice().sort((a, b) => b.minutes - a.minutes), [pieData]);

  return (
    <Card className={CARD_CLASS}>
      <CardContent className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#172c5b]">
          <i className={`h-2.5 w-2.5 rounded-full ${tone === "blue" ? "bg-[#5793f5]" : "bg-[#f4ba3c]"}`} />
          {title}
        </h3>
        <div className="mt-2 h-[160px]">
          {!analysis ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Start comparison to show the trend.
            </div>
          ) : chartType === "pie" ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<RideDowntimeTooltip />} />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  innerRadius={25}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : chartType === "bar" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rideBarData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="#e1e7f4" />
                <XAxis dataKey="rideCode" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "#65738f" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "#65738f" }} unit="m" />
                <Tooltip content={<RideDowntimeTooltip />} />
                <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
                  {rideBarData.map((entry, index) => <Cell key={`${entry.rideCode}-${index}`} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 7, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#e1e7f4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 8, fill: "#65738f" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 8, fill: "#65738f" }} unit="m" />
                <Tooltip content={<RideDowntimeTooltip />} cursor={{ stroke, strokeDasharray: "3 3" }} />
                <Line type="monotone" dataKey="minutes" stroke={stroke} strokeWidth={2.2} dot={{ r: 3, fill: stroke, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OverlapTrend({ before, after }: { before?: AnalysisResult | null; after?: AnalysisResult | null }) {
  const data = useMemo(() => {
    const map = new Map<string, any>();
    before?.dailyTrend.forEach(point => map.set(point.dateKey, { ...(map.get(point.dateKey) ?? {}), label: point.label, aMinutes: point.minutes, aPercentage: point.percentage }));
    after?.dailyTrend.forEach(point => map.set(point.dateKey, { ...(map.get(point.dateKey) ?? {}), label: point.label, bMinutes: point.minutes, bPercentage: point.percentage }));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  }, [before, after]);
  return <Card className={`${CARD_CLASS} h-full`}><CardContent className="p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-extrabold text-[#172c5b]">Overlap comparison trend</h3><div className="flex gap-3 text-[10px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#5793f5]" />Scenario A</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#f4ba3c]" />Scenario B</span></div></div><div className="mt-3 h-[278px]">{before || after ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: -12 }}><CartesianGrid vertical={false} stroke="#e1e7f4" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#65738f" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#65738f" }} /><Tooltip content={({ active, payload, label }) => { if (!active || !payload?.length) return null; const item = payload[0]?.payload; if (!item) return null; return <div className="rounded-lg bg-[#18366e] px-3 py-2 text-xs font-bold text-white shadow-xl"><p className="mb-1 text-[10px] uppercase text-blue-100">{item.label ?? label}</p>{item.aMinutes !== undefined && <p><span className="text-[#79a8ff]">A:</span> {Math.round(item.aMinutes)} min ({Number(item.aPercentage).toFixed(1)}%)</p>}{item.bMinutes !== undefined && <p className="mt-0.5"><span className="text-[#ffd05a]">B:</span> {Math.round(item.bMinutes)} min ({Number(item.bPercentage).toFixed(1)}%)</p>}</div>; }} cursor={{ stroke: "#4c618d", strokeDasharray: "4 4" }} /><Line type="monotone" dataKey="aMinutes" stroke="#5793f5" strokeWidth={2.5} dot={{ r: 3.5, fill: "#5793f5", stroke: "#fff", strokeWidth: 1.5 }} /><Line type="monotone" dataKey="bMinutes" stroke="#f4ba3c" strokeWidth={2.5} dot={{ r: 3.5, fill: "#f4ba3c", stroke: "#fff", strokeWidth: 1.5 }} /></LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-slate-400">Results will appear here after comparison starts.</div>}</div></CardContent></Card>;
}

function PerformanceDifference({ before, after, afterName }: { before: AnalysisResult; after: AnalysisResult; afterName: string }) {
  const availabilityChange = (100 - after.averageDowntimePercentage) - (100 - before.averageDowntimePercentage);
  const downtimeChange = deltaPercent(after.totalTechnicalMinutes, before.totalTechnicalMinutes);
  const interruptionChange = after.averageIncidentMinutes - before.averageIncidentMinutes;
  const trendGood = (downtimeChange ?? 0) < 0 && availabilityChange >= 0;
  const isNeutral = Math.abs(downtimeChange ?? 0) < 0.01 && Math.abs(availabilityChange) < 0.01 && Math.abs(interruptionChange) < 0.01;
  const Item = ({ label, value, good, neutral }: { label: string; value: string; good: boolean; neutral?: boolean }) => <div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${neutral ? "bg-slate-100 text-slate-600" : good ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{neutral ? <Gauge className="h-3.5 w-3.5" /> : good ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}</span><div><p className={`text-base font-extrabold ${neutral ? "text-slate-600" : good ? "text-emerald-700" : "text-rose-700"}`}>{value}</p><p className="text-[10px] text-slate-500">{label}</p></div></div>;
  return <Card className="border-emerald-100 bg-gradient-to-r from-white via-emerald-50/80 to-white shadow-sm"><CardContent className="grid gap-4 p-4 md:grid-cols-[1.15fr_repeat(3,1fr)_1.5fr] md:items-center"><EditableText contentKey="compare_difference_title" defaultText="Performance difference" as="h2" className="block text-base font-extrabold text-[#172c5b]" /><Item label="total downtime" value={`${downtimeChange === null ? "—" : `${downtimeChange > 0 ? "+" : ""}${downtimeChange.toFixed(0)}%`}`} good={(downtimeChange ?? 0) <= 0} neutral={isNeutral} /><Item label="availability" value={`${availabilityChange >= 0 ? "+" : ""}${availabilityChange.toFixed(2)} pp`} good={availabilityChange >= 0} neutral={isNeutral} /><Item label="avg tech interruption" value={`${interruptionChange > 0 ? "+" : ""}${interruptionChange.toFixed(1)} min`} good={interruptionChange <= 0} neutral={isNeutral} /><div className={`flex items-center gap-2 text-xs font-bold ${isNeutral ? "text-slate-600" : trendGood ? "text-emerald-700" : "text-rose-700"}`}>{isNeutral ? <Gauge className="h-5 w-5" /> : trendGood ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{afterName} is {isNeutral ? "matching the selected baseline" : trendGood ? "trending better" : "showing a mixed or weaker result"} across selected rides.</div></CardContent></Card>;
}

function MetricComparisonRow({ icon: Icon, label, detail, before, after, delta, good }: { icon: any; label: string; detail: string; before: string; after: string; delta?: string; good?: boolean }) {
  return <div className="grid min-w-[700px] grid-cols-[1.25fr_0.7fr_0.9fr] border-b border-[#e3e8f2] text-xs"><div className="flex items-center gap-3 bg-slate-50/70 p-3.5"><Icon className="h-5 w-5 text-[#1e4ca1]" /><div><p className="font-bold text-[#172c5b]">{label}</p><p className="text-[10px] text-slate-500">{detail}</p></div></div><div className="flex items-center p-3.5 font-semibold text-slate-800">{before}</div><div className="flex flex-wrap items-center gap-2 p-3.5 font-semibold text-slate-800"><span>{after}</span>{delta && <Badge className={`${good ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"} hover:bg-inherit`}><span className="mr-0.5">{good ? "▼" : "▲"}</span>{delta}</Badge>}</div></div>;
}

function ComparisonMetrics({ before, after, scenarioA, scenarioB }: { before: AnalysisResult; after: AnalysisResult; scenarioA: Scenario; scenarioB: Scenario }) {
  const availabilityA = 100 - before.averageDowntimePercentage; const availabilityB = 100 - after.averageDowntimePercentage;
  const availabilityDelta = availabilityB - availabilityA;
  const downtimeDelta = deltaPercent(after.totalTechnicalMinutes, before.totalTechnicalMinutes);
  const eventDelta = deltaPercent(after.totalEvents, before.totalEvents);
  const interruptionDelta = after.averageIncidentMinutes - before.averageIncidentMinutes;
  const evacDelta = deltaPercent(after.totalEvacuationEvents, before.totalEvacuationEvents);
  return <div className="overflow-x-auto rounded-xl border border-[#d7e0f0] bg-white shadow-sm"><div className="grid min-w-[700px] grid-cols-[1.25fr_0.7fr_0.9fr] border-b border-[#d7e0f0] bg-[#f5f7fd]"><div className="flex items-center gap-2 p-3 text-[10px] font-extrabold tracking-wide text-[#172c5b]"><Layers3 className="h-4 w-4" />METRIC / CATEGORY</div><div className="p-3"><p className="flex items-center gap-1.5 text-xs font-extrabold text-[#172c5b]"><i className="flex h-4 w-4 items-center justify-center rounded-full bg-[#5793f5] text-[9px] text-white">A</i>{scenarioA.name}</p><p className="mt-1 text-[10px] text-slate-500">{compactDateRange(scenarioA.dateKeys)} · {scopeLabel(scenarioA.rideCodes)}</p></div><div className="p-3"><p className="flex items-center gap-1.5 text-xs font-extrabold text-[#172c5b]"><i className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f4ba3c] text-[9px] text-white">B</i>{scenarioB.name}</p><p className="mt-1 text-[10px] text-slate-500">{compactDateRange(scenarioB.dateKeys)} · {scopeLabel(scenarioB.rideCodes)}</p></div></div><div className="bg-[#172c5b] px-4 py-2 text-[10px] font-extrabold tracking-wider text-white">OVERVIEW & RIDES AVAILABILITY</div><MetricComparisonRow icon={ShieldCheck} label="Availability" detail="% of scheduled operating time" before={`${availabilityA.toFixed(2)}%`} after={`${availabilityB.toFixed(2)}%`} delta={`${availabilityDelta > 0 ? "+" : ""}${availabilityDelta.toFixed(2)} pp`} good={availabilityDelta >= 0} /><MetricComparisonRow icon={Clock3} label="Total technical downtime" detail="Technical 11-1 only" before={`${before.totalTechnicalMinutes} min`} after={`${after.totalTechnicalMinutes} min`} delta={downtimeDelta === null ? undefined : `${downtimeDelta > 0 ? "+" : ""}${downtimeDelta.toFixed(0)}%`} good={(downtimeDelta ?? 0) <= 0} /><MetricComparisonRow icon={AlertTriangle} label="Recorded incidents" detail="Total incidents" before={`${before.totalEvents}`} after={`${after.totalEvents}`} delta={eventDelta === null ? undefined : `${eventDelta > 0 ? "+" : ""}${eventDelta.toFixed(0)}%`} good={(eventDelta ?? 0) <= 0} /><MetricComparisonRow icon={Gauge} label="Avg tech interruption" detail="Minutes per incident" before={`${before.averageIncidentMinutes.toFixed(1)} min`} after={`${after.averageIncidentMinutes.toFixed(1)} min`} delta={`${interruptionDelta > 0 ? "+" : ""}${interruptionDelta.toFixed(1)} min`} good={interruptionDelta <= 0} /><MetricComparisonRow icon={Users} label="Evacuation occurrences" detail="Total occurrences" before={`${before.totalEvacuationEvents}`} after={`${after.totalEvacuationEvents}`} delta={evacDelta === null ? undefined : `${evacDelta > 0 ? "+" : ""}${evacDelta.toFixed(0)}%`} good={(evacDelta ?? 0) <= 0} /></div>;
}

function RideInsightPanels({ before, after }: { before: AnalysisResult; after: AnalysisResult }) {
  const changes = useMemo(() => {
    const beforeMap = new Map(before.topRides.map(ride => [ride.rideCode, ride]));
    const afterMap = new Map(after.topRides.map(ride => [ride.rideCode, ride]));
    return FLEET_RIDES.map(([code, name]) => { const a = beforeMap.get(code); const b = afterMap.get(code); const beforeMinutes = a?.minutes ?? 0; const afterMinutes = b?.minutes ?? 0; return { code, name, beforeMinutes, afterMinutes, percentage: beforeMinutes ? ((afterMinutes - beforeMinutes) / beforeMinutes) * 100 : afterMinutes ? 100 : 0, values: [beforeMinutes, afterMinutes] }; }).filter(item => item.beforeMinutes || item.afterMinutes);
  }, [before.topRides, after.topRides]);
  const improvements = changes.filter(change => change.percentage < 0).sort((a, b) => a.percentage - b.percentage).slice(0, 3);
  const followUps = changes.filter(change => change.percentage > 0).sort((a, b) => b.percentage - a.percentage).slice(0, 3);
  const Panel = ({ title, items, tone }: { title: string; items: typeof changes; tone: "green" | "rose" }) => <Card className={tone === "green" ? "border-emerald-100 bg-emerald-50/60 shadow-sm" : "border-rose-100 bg-rose-50/60 shadow-sm"}><CardContent className="p-4"><h3 className={`flex items-center gap-2 text-sm font-extrabold ${tone === "green" ? "text-emerald-800" : "text-rose-800"}`}>{tone === "green" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}{title}</h3><div className="mt-3 space-y-2">{items.length ? items.map(item => <div key={item.code} className="flex items-center gap-2 border-t border-white/80 pt-2 first:border-0 first:pt-0"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{item.name}</p><p className="font-mono text-[9px] text-slate-500">{item.code}</p></div><MiniSparkline values={item.values} tone={tone} /><span className={`w-12 text-right text-xs font-extrabold ${tone === "green" ? "text-emerald-700" : "text-rose-700"}`}>{item.percentage > 0 ? "+" : ""}{item.percentage.toFixed(0)}%</span></div>) : <p className="py-3 text-xs text-slate-500">No material ride-level change is available.</p>}</div></CardContent></Card>;
  return <div className="space-y-4"><Panel title="Largest improvement" items={improvements} tone="green" /><Panel title="Needs follow-up" items={followUps} tone="rose" /></div>;
}

const STORAGE_KEY_COMPARE_HISTORY = "skyworlds_compare_history_v139";

function CompareTab({ reports }: { reports: SavedReport[] }) {
  const availableDateKeys = useMemo(() => Array.from(new Set(reports.map(report => report.reportDate))).sort(), [reports]);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: "A", name: "Before maintenance", dateKeys: new Set(), rideCodes: [] },
    { id: "B", name: "After maintenance", dateKeys: new Set(), rideCodes: [] },
  ]);
  const [started, setStarted] = useState(false);
  // Default chart type in comparison: "bar" (1st), "line" (2nd), "pie" (3rd)
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");

  // Comparison history stored in localStorage (max 5 items, newest on left)
  const [historyList, setHistoryList] = useState<CompareHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPARE_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 5);
      }
    } catch {
      // ignore
    }
    return [];
  });

  const utils = trpc.useUtils();
  const serverHistoryQuery = trpc.comparisonHistory.list.useQuery();
  const recordHistoryMutation = trpc.comparisonHistory.record.useMutation({
    onSuccess: () => {
      utils.comparisonHistory.list.invalidate();
    },
  });

  useEffect(() => {
    if (serverHistoryQuery.data && serverHistoryQuery.data.length > 0) {
      const serverItems: CompareHistoryItem[] = serverHistoryQuery.data.map(item => {
        try {
          const parsed = JSON.parse(item.scenariosJson);
          return {
            id: String(item.id),
            timestamp: new Date(item.createdAt).getTime(),
            label: item.label,
            scenarioA: parsed.scenarioA,
            scenarioB: parsed.scenarioB,
          };
        } catch {
          return null;
        }
      }).filter(Boolean) as CompareHistoryItem[];

      if (serverItems.length) {
        setHistoryList(serverItems.slice(0, 5));
      }
    }
  }, [serverHistoryQuery.data]);

  const saveHistory = (scenA: Scenario, scenB: Scenario) => {
    const summaryA = scenarioHistorySummary(scenA.rideCodes, scenA.dateKeys);
    const summaryB = scenarioHistorySummary(scenB.rideCodes, scenB.dateKeys);
    const label = `${summaryA} vs ${summaryB}`;
    const newItem: CompareHistoryItem = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      label,
      scenarioA: {
        name: scenA.name,
        dateKeys: Array.from(scenA.dateKeys),
        rideCodes: scenA.rideCodes,
      },
      scenarioB: {
        name: scenB.name,
        dateKeys: Array.from(scenB.dateKeys),
        rideCodes: scenB.rideCodes,
      },
    };

    setHistoryList(prev => {
      // Avoid duplicate top
      const filtered = prev.filter(item => item.label !== label);
      const next = [newItem, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(STORAGE_KEY_COMPARE_HISTORY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    recordHistoryMutation.mutate({
      label,
      scenariosJson: JSON.stringify({
        scenarioA: newItem.scenarioA,
        scenarioB: newItem.scenarioB,
      }),
    });
  };

  const applyHistory = (item: CompareHistoryItem) => {
    setScenarios([
      {
        id: "A",
        name: item.scenarioA.name,
        dateKeys: new Set(item.scenarioA.dateKeys),
        rideCodes: item.scenarioA.rideCodes,
      },
      {
        id: "B",
        name: item.scenarioB.name,
        dateKeys: new Set(item.scenarioB.dateKeys),
        rideCodes: item.scenarioB.rideCodes,
      },
    ]);
    setStarted(false); // User must click "Start comparison" to run
    toast.info(`Pre-filled comparison: ${item.label}. Click "Start comparison" to run.`);
  };

  const updateScenario = (next: Scenario) => {
    setScenarios(current => current.map(scenario => scenario.id === next.id ? next : scenario));
    setStarted(false);
  };

  const reportIds = useMemo(() => scenarios.map(scenario => reports.filter(report => scenario.dateKeys.has(report.reportDate)).map(report => report.id)), [scenarios, reports]);
  const first = scenarios[0];
  const second = scenarios[1];
  const third = scenarios[2];

  const queryA = trpc.analysis.get.useQuery({ reportIds: reportIds[0] ?? [], rideCodes: first.rideCodes }, { enabled: started && (reportIds[0]?.length ?? 0) > 0 });
  const queryB = trpc.analysis.get.useQuery({ reportIds: reportIds[1] ?? [], rideCodes: second.rideCodes }, { enabled: started && (reportIds[1]?.length ?? 0) > 0 });
  const queryC = trpc.analysis.get.useQuery({ reportIds: reportIds[2] ?? [], rideCodes: third?.rideCodes ?? [] }, { enabled: started && Boolean(third) && (reportIds[2]?.length ?? 0) > 0 });

  const valid = Boolean(reportIds[0]?.length && reportIds[1]?.length);
  const calculating = queryA.isLoading || queryB.isLoading || queryC.isLoading;
  const before = started ? queryA.data : null;
  const after = started ? queryB.data : null;

  const handleStartComparison = () => {
    setStarted(true);
    saveHistory(first, second);
  };

  const addThird = () => setScenarios(current => [...current, { id: "C", name: "Third scenario", dateKeys: new Set(), rideCodes: [] }]);

  return (
    <div className="space-y-5">
      {/* Comparison History Section (positioned before date selection, horizontal scroll, max 5, narrow) */}
      {historyList.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 shrink-0 px-2 text-xs font-bold text-[#172c5b]">
            <History className="h-4 w-4 text-[#1e4ca1]" />
            <span>Recent</span>
          </div>
          <div className="flex flex-1 items-center gap-2 overflow-x-auto py-0.5 scrollbar-thin">
            {historyList.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyHistory(item)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-[#1e4ca1] hover:bg-blue-50 hover:text-[#1e4ca1]"
                title="Click to pre-fill comparison parameters"
              >
                <span className="max-w-[240px] truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scenarios Date & Ride Selection */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          {scenarios.map(scenario => (
            <ScenarioCard key={scenario.id} scenario={scenario} availableDateKeys={availableDateKeys} onChange={updateScenario} />
          ))}
        </div>
        {!third && (
          <Button variant="outline" onClick={addThird} className="h-11 shrink-0 border-[#cdd8ef] bg-white font-bold text-[#1e4ca1]">
            <Plus className="mr-1.5 h-4 w-4" />
            Add third scenario
          </Button>
        )}
      </div>

      {/* Start comparison button */}
      <div className="flex flex-col items-center">
        <Button
          size="lg"
          onClick={handleStartComparison}
          disabled={!valid || calculating}
          className="h-11 min-w-56 bg-emerald-600 px-8 text-sm font-extrabold text-white hover:bg-emerald-700"
        >
          {calculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {started ? "Recalculate comparison" : "Start comparison"}
        </Button>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {valid ? "Results calculate after Start comparison is pressed." : "Select valid date ranges for Scenario A and Scenario B."}
        </p>
      </div>

      {(queryA.error || queryB.error || queryC.error) && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex gap-3 p-4 text-xs text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {queryA.error?.message ?? queryB.error?.message ?? queryC.error?.message}
          </CardContent>
        </Card>
      )}

      {started && calculating && (
        <Card className={CARD_CLASS}>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Calculating comparison across saved source reports…
          </CardContent>
        </Card>
      )}

      {started && !calculating && before && after && (
        <>
          {/* Comparison Trends with 3-tab chart switcher: Bar (default), Line, Pie */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#172c5b]">Comparative visualization</h2>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setChartType("bar")}
                className={`rounded-md px-3 py-1 text-[10px] font-extrabold transition-all ${
                  chartType === "bar" ? "bg-[#5793f5] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Bar chart
              </button>
              <button
                type="button"
                onClick={() => setChartType("line")}
                className={`rounded-md px-3 py-1 text-[10px] font-extrabold transition-all ${
                  chartType === "line" ? "bg-[#5793f5] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Line chart
              </button>
              <button
                type="button"
                onClick={() => setChartType("pie")}
                className={`rounded-md px-3 py-1 text-[10px] font-extrabold transition-all ${
                  chartType === "pie" ? "bg-[#5793f5] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Pie chart
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.25fr]">
            <div className="grid gap-4">
              <CompareVisualTrend title="Scenario A trend" analysis={before} tone="blue" chartType={chartType} />
              <CompareVisualTrend title="Scenario B trend" analysis={after} tone="amber" chartType={chartType} />
            </div>
            <OverlapTrend before={before} after={after} />
          </div>

          <PerformanceDifference before={before} after={after} afterName={second.name} />

          <div className="grid gap-4 xl:grid-cols-[1.75fr_0.75fr]">
            <ComparisonMetrics before={before} after={after} scenarioA={first} scenarioB={second} />
            <RideInsightPanels before={before} after={after} />
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalysisStudio() {
  const utils = trpc.useUtils();
  const initialTab: Tab = new URLSearchParams(window.location.search).get("tab") === "compare" ? "compare" : "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedDateKeys, setSelectedDateKeys] = useState<Set<string>>(new Set());
  const [selectedRideCodes, setSelectedRideCodes] = useState<string[]>([]);
  const [savedManagerOpen, setSavedManagerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | undefined>();
  const [copied, setCopied] = useState(false);
  const { data: reports = [], isLoading: reportsLoading, error: reportsError } = trpc.savedReports.list.useQuery();
  const { data: darkDays = [] } = trpc.darkDays.list.useQuery();
  const availableDateKeys = useMemo(() => Array.from(new Set(reports.map(report => report.reportDate))).sort(), [reports]);

  useEffect(() => {
    if (availableDateKeys.length && !selectedDateKeys.size) {
      setSelectedDateKeys(new Set([availableDateKeys[availableDateKeys.length - 1]]));
    }
  }, [availableDateKeys]);

  const selectedReports = useMemo(() => reports.filter(report => selectedDateKeys.has(report.reportDate)), [reports, selectedDateKeys]);
  const reportIds = useMemo(() => selectedReports.map(report => report.id), [selectedReports]);
  const analysisInput = useMemo(() => ({ reportIds, rideCodes: selectedRideCodes }), [reportIds.join(","), selectedRideCodes.join(",")]);
  const analysisQuery = trpc.analysis.get.useQuery(analysisInput, { enabled: tab === "overview" && reportIds.length > 0 });

  const activeMonthPrefix = useMemo(() => {
    const sorted = Array.from(selectedDateKeys).sort();
    if (sorted.length) {
      return sorted[sorted.length - 1].slice(0, 7);
    }
    return availableDateKeys.length ? availableDateKeys[availableDateKeys.length - 1].slice(0, 7) : "";
  }, [selectedDateKeys, availableDateKeys]);

  const deleteMutation = trpc.savedReports.delete.useMutation({
    onSuccess: async () => {
      await utils.savedReports.list.invalidate();
      setDeleteId(undefined);
      toast.success("Saved source log deleted.");
    },
    onError: error => toast.error(error.message),
  });

  const darkDayMutation = trpc.darkDays.set.useMutation({
    onSuccess: async () => {
      await utils.darkDays.list.invalidate();
      await utils.analysis.get.invalidate();
      toast.success("Dark day status updated.");
    },
    onError: error => toast.error(error.message),
  });

  const analysis = analysisQuery.data;
  const setActiveTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", next === "compare" ? "/analysis?tab=compare" : "/analysis");
  };

  const copyIncidentCards = async () => {
    if (!analysis?.rideIncidentGroups.length) {
      toast.error("No incident logs to copy.");
      return;
    }
    const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.6;">${analysis.rideIncidentGroups.map(group => `<div style="margin-top:12px;font-weight:bold;color:#1E293B;">${group.rideCode}: ${group.attraction}</div>${group.logs.map(log => { if (log.kind === "darkDay") return `<div>*${log.dateLabel}, <span style="color:#FF0000;font-weight:bold;">Dark day</span>.</div>`; if (log.kind === "weather") return `<div>*${log.dateLabel}, <span style="color:#FF0000;font-weight:bold;">${log.description}</span>, ${log.durationLabel} (${log.timeRange}), <span style="color:#FF0000;font-weight:bold;">Moderated</span>.</div>`; const evac = log.evacuationLabel && log.evacuationRange ? `, <span style="color:#FF0000;font-weight:bold;">${log.evacuationLabel}</span> (${log.evacuationRange})` : ""; return `<div>*${log.dateLabel}, <span style="color:#FF0000;font-weight:bold;">${log.description}</span>, ${log.durationLabel} (${log.timeRange})${evac}.</div>`; }).join("")}`).join("")}</div>`;
    const plain = analysis.rideIncidentGroups.map(group => `${group.rideCode}: ${group.attraction}\n${group.logs.map(log => `*${log.dateLabel}, ${log.description}${log.durationLabel ? `, ${log.durationLabel} (${log.timeRange})` : ""}.`).join("\n")}`).join("\n\n");
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success("Copied incident remarks for Excel.");
    } catch {
      toast.error("Clipboard access is unavailable. Select the remarks and copy them manually.");
    }
  };

  const singleSelectedDate = selectedDateKeys.size === 1 ? Array.from(selectedDateKeys)[0] : undefined;

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900">
        <header className="flex flex-col gap-4 px-1 pt-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <EditableText
              contentKey="analysis_page_title"
              defaultText="Downtime Analysis Studio"
              as="h1"
              className="block text-3xl font-extrabold tracking-[-0.04em] text-[#162b5b] sm:text-4xl"
            />
            <EditableText
              contentKey="analysis_page_subtitle"
              defaultText={tab === "overview" ? "Find patterns, prioritise risk, and act on technical downtime." : "Compare operating periods and ride groups side by side."}
              as="p"
              className="mt-1 block text-sm text-slate-600"
            />
            <div role="tablist" aria-label="Analysis views" className="mt-3 inline-flex rounded-lg bg-slate-200 p-1">
            <button
              role="tab"
              aria-selected={tab === "overview"}
              onClick={() => setActiveTab("overview")}
              className={`min-h-11 rounded-md px-5 text-xs font-extrabold transition-colors ${
                tab === "overview" ? "bg-[#243b6b] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              Overview
            </button>
            <button
              role="tab"
              aria-selected={tab === "compare"}
              onClick={() => setActiveTab("compare")}
              className={`min-h-11 rounded-md px-5 text-xs font-extrabold transition-colors ${
                tab === "compare" ? "bg-[#243b6b] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              Compare
            </button>
            </div>
          </div>
          {tab === "overview" && singleSelectedDate && (
            <Link href={`/summary?date=${singleSelectedDate}`} className="shrink-0">
              <Button size="sm" className="h-9 gap-1.5 bg-[#1e4ca1] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#163a7d]">
                <Sparkles className="h-3.5 w-3.5 text-yellow-200" />
                Downtime Summary
              </Button>
            </Link>
          )}
        </header>

        {reportsLoading ? (
          <Card className={`${CARD_CLASS} mt-6`}>
            <CardContent className="flex items-center gap-3 p-7 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved downtime reports…
            </CardContent>
          </Card>
        ) : reportsError ? (
          <Card className="mt-6 border-rose-200 bg-rose-50">
            <CardContent className="flex gap-3 p-6 text-sm text-rose-800">
              <AlertTriangle className="h-5 w-5" />
              Saved source reports could not be loaded. Please try again.
            </CardContent>
          </Card>
        ) : !reports.length ? (
          <Card className={`${CARD_CLASS} mt-6`}>
            <CardContent className="flex gap-4 p-7">
              <FileText className="h-7 w-7 shrink-0 text-[#1e4ca1]" />
              <div>
                <h2 className="text-lg font-extrabold text-[#172c5b]">No saved source reports</h2>
                <p className="mt-1 text-sm text-slate-600">Build and save a downtime report in Report Studio to start your analysis.</p>
              </div>
            </CardContent>
          </Card>
        ) : tab === "compare" ? (
          <main className="mt-5">
            <CompareTab reports={reports as SavedReport[]} />
          </main>
        ) : (
          <main className="mt-5 space-y-4">
            <Card className={`${CARD_CLASS} overflow-visible`}>
              <CardContent className="flex flex-col p-0 sm:flex-row">
                <DateRangePicker
                  availableDateKeys={availableDateKeys}
                  selectedDateKeys={selectedDateKeys}
                  onChange={setSelectedDateKeys}
                  darkDays={darkDays}
                />
                <RideScopePicker value={selectedRideCodes} onChange={setSelectedRideCodes} />
                <Button
                  variant="ghost"
                  onClick={() => setSavedManagerOpen(true)}
                  className="h-auto shrink-0 justify-center gap-2 border-t border-slate-100 px-5 py-3 text-xs font-extrabold text-[#1e4ca1] hover:bg-blue-50 sm:border-l sm:border-t-0"
                >
                  <FileText className="h-4 w-4" />
                  View source reports ({reports.length})
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {analysisQuery.isLoading ? (
              <Card className={CARD_CLASS}>
                <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Calculating selected reporting dates…
                </CardContent>
              </Card>
            ) : analysisQuery.error ? (
              <Card className="border-rose-200 bg-rose-50">
                <CardContent className="p-5 text-sm text-rose-800">
                  {analysisQuery.error.message}
                </CardContent>
              </Card>
            ) : analysis ? (
              <>
                <section className="grid gap-4 xl:grid-cols-[1.5fr_0.85fr]">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard
                      contentKey="overview_total_downtime"
                      label="Total downtime"
                      value={`${analysis.totalTechnicalMinutes.toLocaleString()} min`}
                      detail={`${analysis.selectedDayCount} selected day${analysis.selectedDayCount === 1 ? "" : "s"}`}
                      tone="blue"
                    />
                    <MetricCard
                      contentKey="overview_availability"
                      label="Availability"
                      value={`${(100 - analysis.averageDowntimePercentage).toFixed(2)}%`}
                      detail="Technical 11-1 availability"
                      tone="mint"
                    />
                    <MetricCard
                      contentKey="overview_incidents_per_day"
                      label="Incidents per day"
                      value={analysis.averageEventsPerDay.toFixed(1)}
                      detail={`${analysis.affectedRideCount} rides affected`}
                      tone="amber"
                    />
                    <MetricCard
                      contentKey="overview_avg_interruption"
                      label="Avg tech interruption"
                      value={`${analysis.averageIncidentMinutes.toFixed(1)} min`}
                      detail={
                        analysis.totalEvents && analysis.maxIncidentMinutes !== undefined && analysis.minIncidentMinutes !== undefined
                          ? `(Max ${analysis.maxIncidentMinutes} mins) (Min ${analysis.minIncidentMinutes} mins)`
                          : "No incidents"
                      }
                      tone="blue"
                    />
                    {analysis.selectedDayCount > 1 ? (
                      <>
                        <MetricCard
                          contentKey="overview_peak_day"
                          label="Peak day"
                          value={analysis.peakDay ? `${analysis.peakDay.minutes} min` : "—"}
                          detail={analysis.peakDay ? dateWithWeekday(analysis.peakDay.dateKey) : "No technical events"}
                          tone="rose"
                        />
                        <MetricCard
                          contentKey="overview_quietest_day"
                          label="Quietest day"
                          value={analysis.dailyTrend.length ? `${Math.min(...analysis.dailyTrend.map(day => day.minutes))} min` : "—"}
                          detail={
                            analysis.dailyTrend.length
                              ? dateWithWeekday([...analysis.dailyTrend].sort((a, b) => a.minutes - b.minutes)[0].dateKey)
                              : "No operating days"
                          }
                          tone="mint"
                        />
                      </>
                    ) : (
                      <>
                        <MetricCard
                          contentKey="overview_worst_ride"
                          label="Worst affected ride"
                          value={analysis.topRides[0]?.rideCode ?? "—"}
                          detail={
                            analysis.topRides[0]
                              ? `${analysis.topRides[0].minutes} min · ${analysis.topRides[0].availabilityPercentage.toFixed(1)}% availability`
                              : "No ride impact"
                          }
                          tone="rose"
                        />
                        <MetricCard
                          contentKey="overview_evacuations"
                          label="Evacuations"
                          value={`${analysis.totalEvacuationEvents}`}
                          detail={`${analysis.totalEvacuationMinutes} min total evacuation time`}
                          tone="amber"
                        />
                      </>
                    )}
                  </div>
                  <RankingPanel analysis={analysis} />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
                  <TrendPanel analysis={analysis} />
                  <KpiCalendarPanel
                    reports={reports as SavedReport[]}
                    darkDays={darkDays}
                    scope={scopeLabel(selectedRideCodes)}
                    monthDate={activeMonthPrefix ? asDate(`${activeMonthPrefix}-01`) : undefined}
                  />
                </section>

                <IncidentLogs
                  analysis={analysis}
                  copied={copied}
                  onCopy={copyIncidentCards}
                />
              </>
            ) : null}
          </main>
        )}

        <SavedSourceManager
          open={savedManagerOpen}
          onOpenChange={setSavedManagerOpen}
          reports={reports as SavedReport[]}
          onDelete={setDeleteId}
          deleting={deleteMutation.isPending}
          darkDays={darkDays}
          onToggleDarkDay={(dateKey, isDarkDay) => darkDayMutation.mutate({ dateKey, isDarkDay })}
          updatingDarkDay={darkDayMutation.isPending}
        />

        <AlertDialog open={deleteId !== undefined} onOpenChange={open => !open && setDeleteId(undefined)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this saved log?</AlertDialogTitle>
              <AlertDialogDescription>
                Deletion removes this saved source file and cannot be undone. Any active analysis depending on it will update after deletion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
                disabled={deleteMutation.isPending}
                className="bg-rose-700 text-white hover:bg-rose-800"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete saved log"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
