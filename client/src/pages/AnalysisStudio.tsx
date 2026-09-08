import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { IncidentLogEntry } from "@/components/IncidentLogEntry";
import { CompactSavedReportLibrary } from "@/components/CompactSavedReportLibrary";
import { RideCombinationSwitch, FLEET_RIDES } from "@/components/RideCombinationSwitch";
import {
  DEFAULT_THRESHOLDS,
  getSeverityForMinutes,
  SeverityKeyBar,
  type SeverityThresholds,
} from "@/components/SeverityThresholdControl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Archive,
  CalendarDays,
  FileText,
  Loader2,
  Medal,
  Moon,
  TrendingDown,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EditableNotice } from "@/components/EditableNotice";

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function Metric({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "blue" | "indigo" | "rose" | "mint" | "amber";
}) {
  const classes = {
    blue: "bg-blue-100 text-blue-800",
    indigo: "bg-indigo-100 text-indigo-800",
    rose: "bg-rose-100 text-rose-800",
    mint: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
      <CardContent className="p-5">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
        <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${classes[tone]}`}>
          {detail}
        </span>
      </CardContent>
    </Card>
  );
}

function WeekdayTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      weekday: string;
      minutes: number;
      events: number;
      days: number;
      dates: string[];
    };
  }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-xl border border-[#adbBda]/80 bg-[#f8f9ff] p-3 text-xs text-slate-800 shadow-xl min-w-44">
      <div className="flex items-center justify-between gap-2 border-b border-[#adbBda]/40 pb-1.5">
        <span className="font-extrabold text-slate-900">{entry.weekday}</span>
        <span className="font-mono-report font-bold text-[#3D52A0]">{entry.minutes} min</span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-slate-600">
        <div className="flex justify-between">
          <span>Events:</span>
          <strong className="text-slate-900">{entry.events}</strong>
        </div>
        <div className="flex justify-between">
          <span>Sample days:</span>
          <strong className="text-slate-900">{entry.days}</strong>
        </div>
        {entry.dates?.length ? (
          <div className="mt-2 pt-1 border-t border-slate-200/70">
            <span className="font-semibold text-slate-500 block mb-1">Dates:</span>
            <div className="flex flex-wrap gap-1">
              {entry.dates.map((d, i) => (
                <span
                  key={i}
                  className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-[#3D52A0] border border-indigo-100"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AnalysisStudio() {
  const utils = trpc.useUtils();
  const { user, loading: authLoading } = useAuth();
  const { data: reports, isLoading: reportsLoading, error: reportsError } = trpc.savedReports.list.useQuery();
  const { data: darkDaysList = [] } = trpc.darkDays.list.useQuery();
  const [selectedDateKeys, setSelectedDateKeys] = useState<Set<string>>(new Set());
  const [selectedRideCodes, setSelectedRideCodes] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<number>();
  const [rangeStartKey, setRangeStartKey] = useState<string | null>(null);
  const [isDarkDayMode, setIsDarkDayMode] = useState<boolean>(false);
  const hasInitializedDates = useRef(false);

  // Configurable severity thresholds with localStorage persistence
  const [thresholds, setThresholds] = useState<SeverityThresholds>(() => {
    try {
      const saved = localStorage.getItem("downtime-severity-thresholds");
      return saved ? JSON.parse(saved) : DEFAULT_THRESHOLDS;
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  });

  const handleThresholdsChange = (next: SeverityThresholds) => {
    setThresholds(next);
    try {
      localStorage.setItem("downtime-severity-thresholds", JSON.stringify(next));
      toast.success("Severity thresholds updated!");
    } catch {
      // ignore
    }
  };

  const availableDateKeys = useMemo(
    () => Array.from(new Set((reports ?? []).map(report => report.reportDate))).sort(),
    [reports]
  );

  useEffect(() => {
    if (availableDateKeys.length && !hasInitializedDates.current) {
      // Auto-select ONLY the single most recent available downtime log date
      const latestDateKey = availableDateKeys[availableDateKeys.length - 1];
      setSelectedDateKeys(new Set([latestDateKey]));
      hasInitializedDates.current = true;
    }
  }, [availableDateKeys]);

  const selectedReports = useMemo(
    () => (reports ?? []).filter(report => selectedDateKeys.has(report.reportDate)),
    [reports, selectedDateKeys]
  );
  const selectedReportIds = useMemo(() => selectedReports.map(report => report.id), [selectedReports]);
  const selectedReportIdsKey = useMemo(() => selectedReportIds.join(","), [selectedReportIds]);
  const selectedRideCodesKey = useMemo(() => selectedRideCodes.join(","), [selectedRideCodes]);
  const analysisInput = useMemo(
    () => ({ reportIds: selectedReportIds, rideCodes: selectedRideCodes }),
    [selectedReportIdsKey, selectedRideCodesKey]
  );
  const analysisQuery = trpc.analysis.get.useQuery(analysisInput, { enabled: selectedReportIds.length > 0 });

  const deleteMutation = trpc.savedReports.delete.useMutation({
    onSuccess: async () => {
      await utils.savedReports.list.invalidate();
      setDeleteId(undefined);
      toast.success("The saved log was removed from the system library.");
    },
    onError: error => toast.error(error.message),
  });

  const darkDayMutation = trpc.darkDays.set.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.darkDays.list.invalidate(),
        utils.analysis.get.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const selectedDateObjects = useMemo(
    () =>
      availableDateKeys
        .map(key => new Date(`${key}T12:00:00`))
        .filter(date => selectedDateKeys.has(dateKey(date))),
    [availableDateKeys, selectedDateKeys]
  );
  const darkDayDateObjects = useMemo(
    () => darkDaysList.map(key => new Date(`${key}T12:00:00`)),
    [darkDaysList]
  );

  const handleDayClick = (day: Date) => {
    const key = dateKey(day);
    if (isDarkDayMode) {
      const isCurrentlyDark = darkDaysList.includes(key);
      darkDayMutation.mutate({ dateKey: key, isDarkDay: !isCurrentlyDark });
      toast.info(!isCurrentlyDark ? `Marked ${key} as Dark Day.` : `Removed Dark Day from ${key}.`);
      return;
    }

    if (!availableDateKeys.includes(key)) {
      toast.info(`No saved report is available for ${key}.`);
      return;
    }

    if (!rangeStartKey) {
      setRangeStartKey(key);
      toast.info(`Range start set to ${key}. Click an end date to select all dates in between.`);
      return;
    }

    const start = rangeStartKey < key ? rangeStartKey : key;
    const end = rangeStartKey < key ? key : rangeStartKey;
    const inRange = availableDateKeys.filter(k => k >= start && k <= end);
    setSelectedDateKeys(new Set(inRange));
    setRangeStartKey(null);
    toast.info(`Selected ${inRange.length} date${inRange.length === 1 ? "" : "s"} from ${start} to ${end}`);
  };

  const analysis = analysisQuery.data;

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900 space-y-6">
        {/* Header Hero Banner */}
        <section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-[#adbBda]/70 px-6 py-8 shadow-[0_18px_50px_rgba(61,82,160,0.16)] sm:px-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/30 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Badge className="rounded-full bg-[#3D52A0] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-[#3D52A0]">
                Saved-log intelligence
              </Badge>
              <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">
                Downtime Analysis Studio
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Recall saved Operations logs, focus on any combination of reporting dates and rides, then compare downtime, evacuation, and availability patterns before reviewing full ride incident logs.
              </p>
            </div>
            <div className="max-w-md rounded-2xl border border-[#8697c4]/45 bg-white/65 p-4 text-xs leading-5 text-slate-600 shadow-sm backdrop-blur">
              <strong className="text-slate-900">Calculation scope.</strong> Technical 11-1 events determine downtime and availability. Weather and 11-10 fire-alarm intervals remain visual-only mappings in their source reports.
            </div>
          </div>
        </section>

        <EditableNotice
          contentKey="analysis_studio_notice"
          defaultText="Analysis Studio Scope: Technical 11-1 incidents are calculated based on active operating rides. Latest downtime log auto-selected."
        />

        {reportsLoading ? (
          <Card className="border-[#adbBda]/70 bg-white/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-7 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved downtime reports…
            </CardContent>
          </Card>
        ) : reportsError ? (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="flex gap-3 p-6 text-sm text-rose-800">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              The saved report library could not be loaded. You remain on this website; please try again.
            </CardContent>
          </Card>
        ) : !reports?.length ? (
          <Card className="border-[#adbBda]/70 bg-white/80 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-7 sm:flex-row sm:items-start">
              <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-800">
                <Archive className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">No saved logs yet</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Use Report Studio to generate a report with <strong>Save this report to the website</strong> enabled. Each saved source log will then be available here for multi-date analysis.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Top Workspace Grid: Left = Compact Calendar; Right = Ride Combination (top) + Saved Report Library (bottom) */}
            <div className="grid gap-5 lg:grid-cols-12 items-start">
              {/* Left Column: Compact Calendar Recall Card */}
              <div className="lg:col-span-5 h-full">
                <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)] h-full">
                  <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-[#3D52A0]">
                            01 · Select reporting dates
                          </p>
                          <h2 className="mt-1 text-base font-extrabold tracking-tight">Calendar recall</h2>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant={isDarkDayMode ? "default" : "outline"}
                            size="sm"
                            onClick={() => setIsDarkDayMode(!isDarkDayMode)}
                            className={`h-7 px-2 text-[10px] font-bold transition-all ${
                              isDarkDayMode
                                ? "bg-slate-800 text-white hover:bg-slate-900 border-slate-700"
                                : "border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                            }`}
                          >
                            <Moon className="mr-1 h-3 w-3" />
                            {isDarkDayMode ? "Exit Dark Day" : "Manage Dark Days"}
                          </Button>
                          <CalendarDays className="h-4 w-4 text-[#3D52A0]" />
                        </div>
                      </div>

                      {isDarkDayMode ? (
                        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                          <strong>Dark Day Mode active:</strong> Click any date to toggle its Dark Day status.
                        </div>
                      ) : rangeStartKey ? (
                        <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-900 flex items-center justify-between">
                          <span className="truncate text-[11px]">Start: <strong>{rangeStartKey}</strong>. Click end date.</span>
                          <Button size="sm" variant="ghost" onClick={() => setRangeStartKey(null)} className="h-5 px-1.5 text-[10px]">Cancel</Button>
                        </div>
                      ) : null}

                      {/* Centered, properly-proportioned calendar */}
                      <div className="flex justify-center pt-2">
                        <Calendar
                          mode="multiple"
                          selected={selectedDateObjects}
                          onDayClick={handleDayClick}
                          disabled={date => !availableDateKeys.includes(dateKey(date)) && !isDarkDayMode}
                          weekStartsOn={1}
                          modifiers={{
                            saved: availableDateKeys.map(key => new Date(`${key}T12:00:00`)),
                            darkDay: darkDayDateObjects,
                          }}
                          modifiersClassNames={{
                            saved: "font-bold text-[#3D52A0]",
                          }}
                          className="w-full max-w-[330px] rounded-xl border border-[#adbBda]/50 bg-[#f8f9ff]/80 p-2"
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 font-medium">
                        {selectedReports.length} report{selectedReports.length === 1 ? "" : "s"} selected
                      </p>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedDateKeys(new Set(availableDateKeys))}
                          className="h-7 px-2 text-xs font-bold text-[#3D52A0] hover:text-[#293252]"
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={selectedDateKeys.size === 0}
                          onClick={() => {
                            setSelectedDateKeys(new Set());
                            setRangeStartKey(null);
                          }}
                          className="h-7 px-2 text-xs font-bold text-[#3D52A0] hover:text-[#293252]"
                        >
                          <X className="mr-1 h-3 w-3" />
                          Clear
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Ride Combination (top) + Saved Report Library (bottom) */}
              <div className="lg:col-span-7 space-y-5">
                {/* Ride combination */}
                <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                  <CardContent className="p-5">
                    <RideCombinationSwitch
                      selectedRideCodes={selectedRideCodes}
                      onChange={setSelectedRideCodes}
                    />
                  </CardContent>
                </Card>

                {/* Saved report library below the ride combination */}
                <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                  <CardContent className="p-5">
                    <CompactSavedReportLibrary
                      reports={reports}
                      selectedDateKeys={selectedDateKeys}
                      onToggleDate={reportDate => {
                        setSelectedDateKeys(current => {
                          const next = new Set(current);
                          if (next.has(reportDate)) next.delete(reportDate);
                          else next.add(reportDate);
                          return next;
                        });
                      }}
                      onDeleteReport={id => setDeleteId(id)}
                      canDelete={Boolean(user && !authLoading)}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Analytics Area */}
            <section>
              {analysisQuery.isLoading ? (
                <Card className="border-[#adbBda]/70 bg-white/80 shadow-sm">
                  <CardContent className="flex items-center gap-3 p-7 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Reading saved source logs and calculating trends…
                  </CardContent>
                </Card>
              ) : analysisQuery.error ? (
                <Card className="border-rose-200 bg-rose-50">
                  <CardContent className="flex gap-3 p-6 text-sm text-rose-800">
                    <TriangleAlert className="h-5 w-5 shrink-0" />
                    {analysisQuery.error.message}
                  </CardContent>
                </Card>
              ) : analysis ? (
                <div className="space-y-5">
                  {/* Metrics grid row 1 */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      label="Total technical downtime"
                      value={`${analysis.totalTechnicalMinutes} min`}
                      detail={`${analysis.selectedDayCount} selected day${analysis.selectedDayCount === 1 ? "" : "s"}`}
                    />
                    <Metric
                      label="Recorded incidents"
                      value={analysis.totalEvents}
                      detail={`${analysis.averageEventsPerDay.toFixed(1)} average per day`}
                      tone="rose"
                    />
                    <Metric
                      label="Evac of 11-7/11-17 (mins)"
                      value={`${analysis.totalEvacuationMinutes} min`}
                      detail="technical-record evacuation time"
                      tone="amber"
                    />
                    <Metric
                      label="Evacuation count"
                      value={analysis.totalEvacuationEvents}
                      detail="11-7 / 11-17 occurrences"
                      tone="mint"
                    />
                  </div>

                  {/* Metrics grid row 2 */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      label="Average downtime %"
                      value={`${analysis.averageDowntimePercentage.toFixed(3)}%`}
                      detail="mean of selected daily rates"
                      tone="amber"
                    />
                    <Metric
                      label="Average interruption"
                      value={`${analysis.averageIncidentMinutes.toFixed(1)} min`}
                      detail="technical minutes per event"
                      tone="blue"
                    />
                    <Metric
                      label="Peak downtime day"
                      value={analysis.peakDay ? `${analysis.peakDay.minutes} min` : "—"}
                      detail={analysis.peakDay ? analysis.peakDay.label : "no technical events"}
                      tone="rose"
                    />
                    <Metric
                      label="Rides affected"
                      value={analysis.affectedRideCount}
                      detail={`${analysis.selectedRideCount} ride${analysis.selectedRideCount === 1 ? "" : "s"} in scope`}
                      tone="indigo"
                    />
                  </div>

                  {/* Charts Grid */}
                  <div className="grid gap-5 xl:grid-cols-2">
                    {/* Daily Comparison Chart */}
                    <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-[#3D52A0]">
                              Daily comparison
                            </p>
                            <h2 className="mt-2 text-lg font-extrabold tracking-tight">
                              Technical downtime trend
                            </h2>
                            <p className="mt-1 text-xs text-slate-500">
                              Colour reflects incident severity by total downtime minutes per date.
                            </p>
                          </div>
                          <TrendingDown className="h-5 w-5 text-[#3D52A0]" />
                        </div>

                        {/* Configurable Severity Key */}
                        <SeverityKeyBar
                          thresholds={thresholds}
                          onConfigure={handleThresholdsChange}
                        />

                        <div className="mt-5 h-72">
                          {analysis.dailyTrend.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={analysis.dailyTrend}
                                margin={{ top: 6, right: 8, bottom: 0, left: 4 }}
                              >
                                <CartesianGrid vertical={false} stroke="rgb(112 145 230 / 0.28)" />
                                <XAxis
                                  dataKey="label"
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11, fill: "#596783" }}
                                />
                                <YAxis
                                  width={68}
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11, fill: "#596783" }}
                                  tickFormatter={(value: number) => `${value} min`}
                                />
                                <Tooltip
                                  cursor={{ fill: "rgb(112 145 230 / 0.12)" }}
                                  contentStyle={{
                                    borderRadius: 12,
                                    border: "1px solid #adbBda",
                                    background: "#f8f9ff",
                                    color: "#293252",
                                    fontSize: 12,
                                  }}
                                  formatter={(value: number, name: string) => [
                                    name === "minutes" ? `${value} min` : value,
                                    name === "minutes" ? "Technical downtime" : "Events",
                                  ]}
                                />
                                <Bar dataKey="minutes" radius={[7, 7, 0, 0]}>
                                  {analysis.dailyTrend.map(day => (
                                    <Cell
                                      key={day.dateKey}
                                      fill={getSeverityForMinutes(day.minutes, thresholds).color}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                              Select one or more dates to calculate the trend.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Weekday Pattern Chart */}
                    <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-[#3D52A0]">
                              Weekday pattern
                            </p>
                            <h2 className="mt-2 text-lg font-extrabold tracking-tight">
                              Most downtime by day of week
                            </h2>
                            <p className="mt-1 text-xs text-slate-500">
                              Compare totals and average minutes on matching weekdays (Monday to Sunday).
                            </p>
                          </div>
                          <CalendarDays className="h-5 w-5 text-[#3D52A0]" />
                        </div>

                        {/* Configurable Severity Key */}
                        <SeverityKeyBar
                          thresholds={thresholds}
                          onConfigure={handleThresholdsChange}
                        />

                        <div className="mt-5 h-72">
                          {analysis.weekdayPattern.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={analysis.weekdayPattern}
                                layout="vertical"
                                margin={{ top: 6, right: 14, bottom: 0, left: 0 }}
                              >
                                <CartesianGrid horizontal={false} stroke="rgb(112 145 230 / 0.28)" />
                                <XAxis
                                  type="number"
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11, fill: "#596783" }}
                                  tickFormatter={(value: number) => `${value} min`}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="weekday"
                                  width={42}
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11, fontWeight: 700, fill: "#293252" }}
                                />
                                <Tooltip
                                  cursor={{ fill: "rgb(112 145 230 / 0.12)" }}
                                  content={<WeekdayTooltip />}
                                />
                                <Bar dataKey="minutes" radius={[0, 7, 7, 0]}>
                                  {analysis.weekdayPattern.map(entry => (
                                    <Cell
                                      key={entry.weekday}
                                      fill={getSeverityForMinutes(entry.minutes, thresholds).color}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                              No weekday pattern is available for this selection.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Ride Ranking */}
                  <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-[#3D52A0]">
                            Ride ranking
                          </p>
                          <h2 className="mt-2 text-lg font-extrabold tracking-tight">
                            Lowest availability first
                          </h2>
                          <p className="mt-1 text-xs text-slate-500">
                            Top 5 rides displayed by default. Scroll inside the table to view the remaining fleet rankings.
                          </p>
                        </div>
                        <Medal className="h-5 w-5 text-[#3D52A0]" />
                      </div>
                      <div className="mt-5 max-h-[295px] overflow-auto rounded-xl border border-[#adbBda]/65">
                        <table className="w-full min-w-[760px] text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-[#ede8f5] uppercase tracking-[0.08em] text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Rank</th>
                              <th className="px-4 py-3">Ride</th>
                              <th className="px-4 py-3">Availability</th>
                              <th className="px-4 py-3">Technical downtime</th>
                              <th className="px-4 py-3">Events</th>
                              <th className="px-4 py-3">Evacuation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#adbBda]/40">
                            {analysis.topRides.map((ride, index) => (
                              <tr key={ride.rideCode}>
                                <td className="px-4 py-3 font-mono-report font-bold text-[#3D52A0]">
                                  {index + 1}
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-mono-report font-bold text-slate-800">
                                    {ride.rideCode}
                                  </p>
                                  <p className="mt-0.5 text-slate-500">{ride.attraction}</p>
                                </td>
                                <td
                                  className="px-4 py-3 font-bold"
                                  style={{
                                    color: getSeverityForMinutes(ride.minutes, thresholds).color,
                                  }}
                                >
                                  {ride.availabilityPercentage.toFixed(3)}%
                                </td>
                                <td className="px-4 py-3 font-semibold text-slate-700">
                                  {ride.minutes} min
                                  <br />
                                  <span className="text-[10px] font-normal text-slate-400">
                                    {ride.downtimePercentage.toFixed(3)}% downtime
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600">{ride.events}</td>
                                <td className="px-4 py-3 text-slate-600">
                                  {ride.evacuationMinutes} min
                                  <br />
                                  <span className="text-[10px] text-slate-400">
                                    {ride.evacuationEvents} time
                                    {ride.evacuationEvents === 1 ? "" : "s"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Ride Incident Logs Section */}
                  <Card className="border-[#adbBda]/70 bg-white/80 shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-[#3D52A0]">
                            Incident log intelligence
                          </p>
                          <h2 className="mt-2 text-lg font-extrabold tracking-tight">
                            Ride Incident Logs
                          </h2>
                          <p className="mt-1 text-xs text-slate-500">
                            {selectedRideCodes.length === 0
                              ? "Displaying incident remarks for all rides across the selected dates."
                              : `Displaying incident remarks filtered for ${selectedRideCodes.join(", ")}.`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-[#8697c4]/60 bg-white/70 text-[#3D52A0]"
                          >
                            {analysis.incidentLogs?.length ?? 0} log
                            {analysis.incidentLogs?.length === 1 ? "" : "s"}
                          </Badge>
                          <FileText className="h-5 w-5 text-[#3D52A0]" />
                        </div>
                      </div>

                      <div className="mt-4 max-h-[360px] overflow-y-auto rounded-xl border border-[#adbBda]/65 bg-[#f8f9ff]/70 p-4">
                        {analysis.rideIncidentGroups?.length ? (
                          <div className="space-y-4 divide-y divide-slate-200/80">
                            {analysis.rideIncidentGroups.map(group => (
                              <div key={group.rideCode} className="pt-3 first:pt-0 space-y-1.5">
                                <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono-report font-extrabold text-xs text-[#293252] bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                      {group.rideCode}:
                                    </span>
                                    <span className="text-xs font-bold text-slate-700">
                                      {group.attraction}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono font-semibold text-slate-400">
                                    {group.logs.length} event{group.logs.length === 1 ? "" : "s"}
                                  </span>
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
                          <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                            No incident logs found for the selected rides and dates.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </section>
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteId !== undefined}
          onOpenChange={open => {
            if (!open) setDeleteId(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this saved report?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes its retained library record and makes the source log and generated workbook unavailable in the system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
                disabled={deleteMutation.isPending}
                className="bg-rose-700 text-white hover:bg-rose-800"
              >
                {deleteMutation.isPending ? "Removing…" : "Remove report"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
