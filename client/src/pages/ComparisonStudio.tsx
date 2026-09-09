import React, { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { FLEET_RIDES } from "@/components/RideCombinationSwitch";
import { IncidentLogEntry } from "@/components/IncidentLogEntry";
import { EditableText } from "@/contexts/TextEditContext";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Columns3,
  Filter,
  History,
  Layers,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

type SlotConfig = {
  id: string;
  name: string;
  dateKeys: Set<string>;
  rideCodes: string[];
};

type ComparisonHistoryItem = {
  id: string;
  timestamp: number;
  label: string;
  columnCount: 2 | 3;
  slots: Array<{
    id: string;
    name: string;
    dateKeys: string[];
    rideCodes: string[];
  }>;
};

const HISTORY_STORAGE_KEY = "skyworlds_comparison_history_v1";

function formatDMy(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
}

function generateAutoScenarioName(
  dateKeys: Set<string>,
  rideCodes: string[],
  fallback: string
): string {
  if (dateKeys.size === 0) return fallback;
  const sorted = Array.from(dateKeys).sort();
  const datePart =
    sorted.length === 1
      ? formatDMy(sorted[0])
      : `${formatDMy(sorted[0])}–${formatDMy(sorted[sorted.length - 1])}`;

  if (rideCodes.length === 0 || rideCodes.length === FLEET_RIDES.length) {
    return `All rides on ${datePart}`;
  }
  if (rideCodes.length <= 2) {
    return `${rideCodes.join(", ")} on ${datePart}`;
  }
  return `${rideCodes.length} rides on ${datePart}`;
}

export default function ComparisonStudio() {
  const { data: reports, isLoading: reportsLoading, error: reportsError } =
    trpc.savedReports.list.useQuery();

  const availableDateKeys = useMemo(
    () => Array.from(new Set((reports ?? []).map(r => r.reportDate))).sort(),
    [reports]
  );

  // Column count: 2 by default for clean and wide view; 3rd column on demand
  const [columnCount, setColumnCount] = useState<2 | 3>(2);

  // Comparison calculation trigger state
  const [isCalculated, setIsCalculated] = useState(false);

  // Comparison history (up to 5 previous comparisons)
  const [history, setHistory] = useState<ComparisonHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Slots configuration - default with EMPTY dateKeys to save calculation execution
  const [slots, setSlots] = useState<SlotConfig[]>([
    {
      id: "slot-1",
      name: "All rides on (select dates)",
      dateKeys: new Set<string>(), // None selected by default
      rideCodes: [],
    },
    {
      id: "slot-2",
      name: "All rides on (select dates)",
      dateKeys: new Set<string>(), // None selected by default
      rideCodes: [],
    },
    {
      id: "slot-3",
      name: "All rides on (select dates)",
      dateKeys: new Set<string>(), // None selected by default
      rideCodes: [],
    },
  ]);

  // Prepare report IDs for each slot
  const slotReportIds = useMemo(() => {
    return slots.map(slot => {
      return (reports ?? [])
        .filter(r => slot.dateKeys.has(r.reportDate))
        .map(r => r.id);
    });
  }, [slots, reports]);

  // Run queries only when user presses "Start Comparison" AND dates are selected
  const query1 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[0], rideCodes: slots[0].rideCodes },
    { enabled: isCalculated && slotReportIds[0].length > 0 }
  );
  const query2 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[1], rideCodes: slots[1].rideCodes },
    { enabled: isCalculated && slotReportIds[1].length > 0 }
  );
  const query3 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[2], rideCodes: slots[2].rideCodes },
    { enabled: isCalculated && columnCount === 3 && slotReportIds[2].length > 0 }
  );

  const allResults = [query1.data, query2.data, query3.data];
  const allQueries = [query1, query2, query3];

  const activeSlots = slots.slice(0, columnCount);
  const activeResults = allResults.slice(0, columnCount);
  const activeQueries = allQueries.slice(0, columnCount);

  const updateSlotName = (index: number, name: string) => {
    setSlots(current => {
      const copy = [...current];
      copy[index] = { ...copy[index], name };
      return copy;
    });
  };

  const updateSlotDates = (index: number, dateKeys: Set<string>) => {
    setSlots(current => {
      const copy = [...current];
      const autoName = generateAutoScenarioName(
        dateKeys,
        copy[index].rideCodes,
        `Scenario ${index + 1}`
      );
      copy[index] = { ...copy[index], dateKeys, name: autoName };
      return copy;
    });
  };

  const updateSlotRides = (index: number, rideCodes: string[]) => {
    setSlots(current => {
      const copy = [...current];
      const autoName = generateAutoScenarioName(
        copy[index].dateKeys,
        rideCodes,
        `Scenario ${index + 1}`
      );
      copy[index] = { ...copy[index], rideCodes, name: autoName };
      return copy;
    });
  };

  const resetSlot = (index: number) => {
    setSlots(current => {
      const copy = [...current];
      copy[index] = {
        ...copy[index],
        name: `Scenario ${index + 1}`,
        dateKeys: new Set(),
        rideCodes: [],
      };
      return copy;
    });
  };

  // Start comparison execution handler
  const handleStartComparison = () => {
    const hasAnyDates = activeSlots.some(s => s.dateKeys.size > 0);
    if (!hasAnyDates) {
      toast.error("Please pick dates in at least one scenario before starting comparison.");
      return;
    }
    setIsCalculated(true);

    // Auto-save this comparison into history (max 5 items)
    const label = activeSlots.map(s => s.name).join(" vs ");
    const newHistoryItem: ComparisonHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      label,
      columnCount,
      slots: activeSlots.map(s => ({
        id: s.id,
        name: s.name,
        dateKeys: Array.from(s.dateKeys),
        rideCodes: s.rideCodes,
      })),
    };

    setHistory(prev => {
      const filtered = prev.filter(h => h.label !== label);
      const updated = [newHistoryItem, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    toast.success("Comparison benchmark calculated.");
  };

  const restoreHistory = (item: ComparisonHistoryItem) => {
    setColumnCount(item.columnCount);
    setSlots(current => {
      const next = [...current];
      item.slots.forEach((s, idx) => {
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            name: s.name,
            dateKeys: new Set(s.dateKeys),
            rideCodes: s.rideCodes,
          };
        }
      });
      return next;
    });
    setIsCalculated(true);
    toast.success(`Restored previous comparison: ${item.label}`);
  };

  // Best availability among valid results
  const bestAvailability = useMemo(() => {
    const avails = activeResults.map(r => (r ? 100 - r.averageDowntimePercentage : null));
    const valid = avails.filter((v): v is number => v !== null);
    return valid.length ? Math.max(...valid) : null;
  }, [activeResults]);

  // Lowest downtime minutes among valid results
  const lowestDowntime = useMemo(() => {
    const times = activeResults.map(r => (r ? r.totalTechnicalMinutes : null));
    const valid = times.filter((v): v is number => v !== null);
    return valid.length ? Math.min(...valid) : null;
  }, [activeResults]);

  // Auto-hide 100% rides: If both (all) columns show 100% availability with 0 downtime, hide the ride!
  const visibleRides = useMemo(() => {
    if (!isCalculated || !activeResults.some(r => r !== null)) {
      return FLEET_RIDES;
    }

    return FLEET_RIDES.filter(([code]) => {
      // Check if this ride has downtime (<100% or >0 minutes) in AT LEAST ONE active slot
      const hasDowntime = activeResults.some((res, idx) => {
        if (!res || !res.topRides || activeSlots[idx].dateKeys.size === 0) return false;
        const ride = res.topRides.find((r: any) => r.rideCode === code);
        return ride && (ride.minutes > 0 || ride.availabilityPercentage < 99.999);
      });
      return hasDowntime;
    });
  }, [isCalculated, activeResults, activeSlots]);

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900 space-y-6">
        {/* Header Banner */}
        <section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-[#adbBda]/70 px-6 py-8 shadow-[0_18px_50px_rgba(61,82,160,0.16)] sm:px-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/30 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Badge className="rounded-full bg-[#3D52A0] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-[#3D52A0]">
                Multi-Scenario Benchmark
              </Badge>
              <EditableText
                contentKey="comp_page_title"
                defaultText="Downtime Comparison Studio"
                as="h1"
                className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl block"
              />
              <EditableText
                contentKey="comp_page_desc"
                defaultText="Compare operational scenarios side by side. Showing 2 clean columns by default, with an expandable 3rd column. Pick dates via the calendar picker to calculate comparisons on demand."
                as="p"
                className="mt-3 text-sm leading-6 text-slate-700 block"
              />
            </div>
            <div className="max-w-xs rounded-2xl border border-[#8697c4]/45 bg-white/65 p-3.5 text-xs text-slate-600 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 font-bold text-[#293252] mb-1">
                <Columns3 className="h-4 w-4 text-[#3D52A0]" />
                {columnCount}-Column View
              </div>
              Clean table format with on-demand calculation.
            </div>
          </div>
        </section>

        {reportsLoading ? (
          <Card className="border-[#adbBda]/70 bg-white/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-7 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved reports for comparison…
            </CardContent>
          </Card>
        ) : reportsError ? (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="flex gap-3 p-6 text-sm text-rose-800">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              Failed to load saved reports.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Previous Comparison History (up to 5 saved comparisons) */}
            {history.length > 0 && (
              <div className="rounded-2xl border border-[#adbBda]/70 bg-white/85 p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <History className="h-4 w-4 text-[#3D52A0]" />
                    <span>Previous Comparison History (Saved up to 5)</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Click any history card to reload</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => restoreHistory(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100 text-xs font-semibold text-[#293252] transition-all hover:shadow-xs active:scale-98"
                    >
                      <Sparkles className="h-3 w-3 text-[#3D52A0]" />
                      <span className="truncate max-w-[280px]">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Controls Bar: 2-or-3 Columns Switch */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-600">
                Displaying <strong>{columnCount} comparison columns</strong>. Set start/end dates via calendar, then click Start Comparison.
              </p>
              {columnCount === 2 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setColumnCount(3)}
                  className="h-8 text-xs font-bold bg-[#3D52A0] text-white hover:bg-[#293252] shadow-sm"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add 3rd Column for Comparison
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnCount(2)}
                  className="h-8 text-xs font-bold border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                >
                  <Minus className="mr-1.5 h-3.5 w-3.5" />
                  Hide 3rd Column (2-Column View)
                </Button>
              )}
            </div>

            {/* Slot Configuration Header Cards (2 or 3 columns) */}
            <div className={`grid gap-4 ${columnCount === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
              {activeSlots.map((slot, index) => (
                <div key={slot.id} className="relative">
                  <SlotConfigCard
                    index={index}
                    slot={slot}
                    availableDateKeys={availableDateKeys}
                    onNameChange={name => updateSlotName(index, name)}
                    onDatesChange={keys => updateSlotDates(index, keys)}
                    onRidesChange={rides => updateSlotRides(index, rides)}
                    onReset={() => resetSlot(index)}
                    isLoading={activeQueries[index].isLoading}
                  />
                  {index === 2 && (
                    <button
                      type="button"
                      onClick={() => setColumnCount(2)}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-rose-700 shadow"
                      title="Close 3rd column"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Start Comparison Trigger Button positioned before the comparison table */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-blue-50/80 to-purple-50/90 border border-indigo-200/90 shadow-sm">
              <div>
                <h3 className="text-sm font-extrabold text-[#293252]">
                  {isCalculated ? "Comparison Calculated" : "Ready to Benchmark"}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isCalculated
                    ? "Side-by-side metrics and delta comparisons are active below. Press start anytime to re-evaluate."
                    : "Press Start Comparison below to run queries and render the side-by-side benchmark table."}
                </p>
              </div>
              <Button
                size="lg"
                onClick={handleStartComparison}
                className="h-10 px-6 text-xs font-extrabold bg-[#3D52A0] hover:bg-[#293252] text-white shadow-md active:scale-95 transition-all gap-2"
              >
                <Play className="h-4 w-4 fill-white" />
                {isCalculated ? "Recalculate Comparison" : "Start Comparison"}
              </Button>
            </div>

            {/* GSMArena-Style Side-by-Side Comparison Table */}
            <div className="overflow-hidden rounded-2xl border border-[#adbBda]/70 bg-white shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
              {/* Sticky Column Header */}
              <div className="grid grid-cols-12 bg-[#ede8f5] border-b border-[#adbBda]/60 sticky top-0 z-20 text-xs font-extrabold text-slate-800">
                <div className={`${columnCount === 2 ? "col-span-4" : "col-span-3"} p-4 flex items-center gap-2 border-r border-[#adbBda]/40 text-slate-700 uppercase tracking-wider text-[11px]`}>
                  <Columns3 className="h-4 w-4 text-[#3D52A0]" />
                  Metric / Category
                </div>
                {activeSlots.map((slot, idx) => (
                  <div
                    key={slot.id}
                    className={`${columnCount === 2 ? "col-span-4" : "col-span-3"} p-3.5 border-r last:border-r-0 border-[#adbBda]/40 ${
                      idx === 0
                        ? "bg-indigo-50/50"
                        : idx === 1
                        ? "bg-blue-50/50"
                        : "bg-purple-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-extrabold text-[#293252] text-xs">
                        {slot.name}
                      </span>
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/80 border border-[#8697c4]/40 text-[#3D52A0] shrink-0">
                        Col {idx + 1}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-normal">
                      <span className={slot.dateKeys.size === 0 ? "text-amber-700 font-bold" : "text-slate-700 font-semibold"}>
                        {slot.dateKeys.size === 0
                          ? "No dates selected"
                          : Array.from(slot.dateKeys).sort().map(formatDMy).join(", ")}
                      </span>
                      <span>•</span>
                      <span>
                        {slot.rideCodes.length === 0
                          ? "All 21 rides"
                          : `${slot.rideCodes.length} rides`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Section 1: Overview & Availability */}
              <SectionHeader title="OVERVIEW & FLEET AVAILABILITY" tone="blue" />
              <SpecRow
                label="Fleet Availability"
                detail="Mean operational uptime"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0
                    ? "Select dates"
                    : r
                    ? (100 - r.averageDowntimePercentage).toFixed(3) + "%"
                    : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? 100 - r.averageDowntimePercentage : null)) : undefined}
                deltaType="percentage"
                highlightBest={(val, idx) => {
                  const num = parseFloat(val);
                  return !isNaN(num) && bestAvailability !== null && Math.abs(num - bestAvailability) < 0.005;
                }}
              />
              <SpecRow
                label="Total Technical Downtime"
                detail="11-1 mechanical/electrical"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "Select dates" : r ? `${r.totalTechnicalMinutes} min` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.totalTechnicalMinutes : null)) : undefined}
                deltaType="minutes"
                highlightBest={(val, idx) => {
                  const num = parseInt(val, 10);
                  return !isNaN(num) && lowestDowntime !== null && num === lowestDowntime;
                }}
              />
              <SpecRow
                label="Average Downtime Rate"
                detail="Daily downtime percentage"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "Select dates" : r ? `${r.averageDowntimePercentage.toFixed(3)}%` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.averageDowntimePercentage : null)) : undefined}
                deltaType="rate"
              />
              <SpecRow
                label="Reporting Days"
                detail="Sample size & exact dates"
                columnCount={columnCount}
                values={activeResults.map((r, i) => {
                  const count = activeSlots[i].dateKeys.size;
                  if (count === 0) return "0 days (None)";
                  const sortedStr = Array.from(activeSlots[i].dateKeys).sort().map(formatDMy).join(", ");
                  return `${count} day${count === 1 ? "" : "s"} (${sortedStr})`;
                })}
              />
              <SpecRow
                label="Rides in Scope"
                detail="Operating fleet count"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.selectedRideCount} rides` : "—"
                )}
              />

              {/* Section 2: Interruptions & Evacuations */}
              <SectionHeader title="INTERRUPTIONS & EVACUATIONS" tone="amber" />
              <SpecRow
                label="Recorded Incidents"
                detail="Total stoppage events"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.totalEvents}` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.totalEvents : null)) : undefined}
                deltaType="count"
              />
              <SpecRow
                label="Daily Incident Average"
                detail="Incidents per operating day"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.averageEventsPerDay.toFixed(1)} / day` : "—"
                )}
              />
              <SpecRow
                label="Average Interruption"
                detail="Duration per incident"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.averageIncidentMinutes.toFixed(1)} min` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.averageIncidentMinutes : null)) : undefined}
                deltaType="minutes"
              />
              <SpecRow
                label="Evacuation Time (11-7/11-17)"
                detail="Total evacuation duration"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.totalEvacuationMinutes} min` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.totalEvacuationMinutes : null)) : undefined}
                deltaType="evacuation"
              />
              <SpecRow
                label="Evacuation Occurrences"
                detail="Times passengers unloaded"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0 ? "—" : r ? `${r.totalEvacuationEvents} times` : "—"
                )}
                rawValues={isCalculated ? activeResults.map(r => (r ? r.totalEvacuationEvents : null)) : undefined}
                deltaType="count"
              />
              <SpecRow
                label="Peak Downtime Day"
                detail="Day with highest stoppage"
                columnCount={columnCount}
                values={activeResults.map((r, i) =>
                  !isCalculated || activeSlots[i].dateKeys.size === 0
                    ? "—"
                    : r && r.peakDay
                    ? `${r.peakDay.label} (${r.peakDay.minutes}m)`
                    : "—"
                )}
              />

              {/* Section 3: Ride-by-Ride Breakdown (Auto-hiding 100% available rides) */}
              <SectionHeader
                title={`FLEET RIDE BREAKDOWN (${isCalculated ? `SHOWING ${visibleRides.length} RIDES WITH DOWNTIME` : "ALL ATTRACTIONS"})`}
                tone="indigo"
              />
              {visibleRides.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50">
                  All attractions achieved 100% availability with 0 downtime across the compared scenarios. 100% availability rides are hidden.
                </div>
              ) : (
                visibleRides.map(([code, name]) => (
                  <RideSpecRow
                    key={code}
                    rideCode={code}
                    rideName={name}
                    columnCount={columnCount}
                    results={activeResults}
                    activeSlots={activeSlots}
                    isCalculated={isCalculated}
                  />
                ))
              )}

              {/* Section 4: Day of Week Pattern */}
              <SectionHeader title="DAY OF WEEK PATTERN (MON – SUN)" tone="slate" />
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                <WeekdaySpecRow key={day} weekday={day} columnCount={columnCount} results={activeResults} isCalculated={isCalculated} />
              ))}

              {/* Section 5: Ride Incident Logs Comparison */}
              <SectionHeader title="RIDE INCIDENT LOGS SIDE-BY-SIDE" tone="rose" />
              <div className="grid grid-cols-12 divide-x divide-[#adbBda]/40 bg-slate-50/50">
                <div className={`${columnCount === 2 ? "col-span-4" : "col-span-3"} p-4 text-xs font-bold text-slate-700`}>
                  <p>Chronological Logs</p>
                  <p className="mt-1 text-[10px] text-slate-400 font-normal">
                    Sorted by ride code, including technical, weather, and Dark Day entries.
                  </p>
                </div>
                {activeResults.map((res, idx) => (
                  <div key={idx} className={`${columnCount === 2 ? "col-span-4" : "col-span-3"} p-3 max-h-96 overflow-y-auto space-y-3`}>
                    {!isCalculated || activeSlots[idx].dateKeys.size === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-400">
                        No dates selected or comparison not started. Select dates and click Start Comparison above.
                      </div>
                    ) : res?.rideIncidentGroups?.length ? (
                      res.rideIncidentGroups.map(group => (
                        <div key={group.rideCode} className="space-y-1">
                          <div className="flex items-center gap-1.5 pb-0.5 border-b border-slate-200">
                            <span className="font-mono-report font-bold text-[11px] text-[#293252] bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                              {group.rideCode}:
                            </span>
                            <span className="truncate text-[10px] text-slate-500">
                              {group.attraction}
                            </span>
                          </div>
                          <div className="pl-1 space-y-0.5">
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
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No incident logs in this slot.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

/* --- Helper Subcomponents --- */

function SlotConfigCard({
  index,
  slot,
  availableDateKeys,
  onNameChange,
  onDatesChange,
  onRidesChange,
  onReset,
  isLoading,
}: {
  index: number;
  slot: SlotConfig;
  availableDateKeys: string[];
  onNameChange: (name: string) => void;
  onDatesChange: (keys: Set<string>) => void;
  onRidesChange: (rides: string[]) => void;
  onReset: () => void;
  isLoading: boolean;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [searchRide, setSearchRide] = useState("");
  const [rangeStartKey, setRangeStartKey] = useState<string | null>(null);
  const [isRangeMode, setIsRangeMode] = useState(false);

  const filteredRides = FLEET_RIDES.filter(([c, n]) => {
    if (!searchRide) return true;
    const q = searchRide.toLowerCase();
    return c.toLowerCase().includes(q) || n.toLowerCase().includes(q);
  });

  const handleDayClick = (day: Date) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    if (!availableDateKeys.includes(key)) return;

    if (isRangeMode) {
      if (!rangeStartKey) {
        setRangeStartKey(key);
        return;
      }
      // Select all dates between rangeStartKey and key
      const start = rangeStartKey < key ? rangeStartKey : key;
      const end = rangeStartKey < key ? key : rangeStartKey;
      const inRange = availableDateKeys.filter(k => k >= start && k <= end);
      const next = new Set(slot.dateKeys);
      inRange.forEach(k => next.add(k));
      onDatesChange(next);
      setRangeStartKey(null);
      toast.success(`Selected range from ${formatDMy(start)} to ${formatDMy(end)}.`);
      return;
    }

    // Single click toggle
    const next = new Set(slot.dateKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onDatesChange(next);
  };

  return (
    <Card className="border-[#adbBda]/70 bg-white/85 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3D52A0] text-white text-[10px] font-bold shrink-0">
              {index + 1}
            </span>
            {isEditingName ? (
              <Input
                value={slot.name}
                onChange={e => onNameChange(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                autoFocus
                className="h-7 text-xs font-bold"
              />
            ) : (
              <span
                onClick={() => setIsEditingName(true)}
                className="truncate font-extrabold text-sm text-[#293252] cursor-pointer hover:underline"
                title="Click to rename"
              >
                {slot.name}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            title="Reset scenario"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>

        {/* Controls: Select Dates + Select Rides Popovers */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Date Selector Popover with Interactive Calendar */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-between text-xs px-2.5 border-[#8697c4]/60 bg-white font-semibold"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <CalendarIcon className="h-3.5 w-3.5 text-[#3D52A0]" />
                  <span className="truncate">
                    {slot.dateKeys.size === 0 ? "Pick Dates" : `${slot.dateKeys.size} Dates`}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-white border-[#adbBda]/80 shadow-2xl rounded-2xl" align="start">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-900">Select Dates</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsRangeMode(!isRangeMode);
                        setRangeStartKey(null);
                      }}
                      className={`h-6 px-1.5 text-[10px] font-bold ${
                        isRangeMode ? "bg-indigo-100 text-[#3D52A0]" : "text-slate-500"
                      }`}
                    >
                      {isRangeMode ? "Range: ON" : "Range Mode"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDatesChange(new Set(availableDateKeys))}
                      className="h-6 px-1.5 text-[10px] text-[#3D52A0] font-bold"
                    >
                      All ({availableDateKeys.length})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDatesChange(new Set())}
                      className="h-6 px-1.5 text-[10px] text-slate-400"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Quick presets in comparison calendar */}
                <div className="flex items-center gap-1 pb-1">
                  <span className="text-[10px] font-bold text-slate-400">Presets:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (availableDateKeys.length >= 2) {
                        onDatesChange(new Set([availableDateKeys[availableDateKeys.length - 2]]));
                      }
                    }}
                    className="h-5 px-1.5 text-[10px] font-semibold border-indigo-200 text-[#3D52A0]"
                  >
                    Yesterday
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onDatesChange(new Set(availableDateKeys.slice(-7)));
                    }}
                    className="h-5 px-1.5 text-[10px] font-semibold border-indigo-200 text-[#3D52A0]"
                  >
                    Last 7 Days
                  </Button>
                </div>

                {rangeStartKey && (
                  <div className="rounded bg-indigo-50 border border-indigo-200 px-2 py-1 text-[11px] text-[#3D52A0]">
                    Start date: <strong>{formatDMy(rangeStartKey)}</strong>. Click end date.
                  </div>
                )}

                 <div className="flex justify-center p-1">
                   <Calendar
                     mode="multiple"
                     selected={Array.from(slot.dateKeys).map(k => new Date(`${k}T12:00:00`))}
                     onDayClick={handleDayClick}
                     disabled={date => {
                       const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                       return !availableDateKeys.includes(key);
                     }}
                     weekStartsOn={1}
                     modifiers={{
                       saved: availableDateKeys.map(key => new Date(`${key}T12:00:00`)),
                     }}
                     modifiersClassNames={{
                       saved: "font-bold text-[#3D52A0]",
                     }}
                     className="rounded-xl border border-slate-200 bg-[#f8f9ff]/70 p-2"
                   />
                 </div>
 
                 <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                   <span className="truncate max-w-[200px]">
                     {slot.dateKeys.size === 0
                       ? "None chosen"
                       : Array.from(slot.dateKeys).sort().map(formatDMy).join(", ")}
                   </span>
                   <span className="text-[10px] text-slate-400 shrink-0">
                     {isRangeMode ? "2-click range" : "Click to toggle"}
                   </span>
                 </div>
               </div>
             </PopoverContent>
           </Popover>

          {/* Ride Selector Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-between text-xs px-2.5 border-[#8697c4]/60 bg-white font-semibold"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Filter className="h-3.5 w-3.5 text-[#3D52A0]" />
                  <span className="truncate">
                    {slot.rideCodes.length === 0
                      ? "All 21 Rides"
                      : `${slot.rideCodes.length} Rides`}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 bg-white border-[#adbBda]/80 shadow-xl rounded-xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-900">Select Rides</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRidesChange([])}
                      className="h-5 px-1.5 text-[10px] text-[#3D52A0] font-bold"
                    >
                      All 21
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRidesChange([])}
                      className="h-5 px-1.5 text-[10px] text-slate-400"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Filter ride name..."
                    value={searchRide}
                    onChange={e => setSearchRide(e.target.value)}
                    className="h-7 pl-8 text-xs bg-slate-50"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                  {filteredRides.map(([code, name]) => {
                    const checked = slot.rideCodes.includes(code);
                    return (
                      <label
                        key={code}
                        onClick={() => {
                          if (checked) {
                            onRidesChange(slot.rideCodes.filter(c => c !== code));
                          } else {
                            onRidesChange([...slot.rideCodes, code]);
                          }
                        }}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer ${
                          checked ? "bg-indigo-50 font-bold text-[#293252]" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="truncate pr-2">
                          <strong className="font-mono text-[#3D52A0] mr-1.5">{code}</strong>
                          <span className="text-slate-600 font-normal">{name}</span>
                        </span>
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded border shrink-0 ${
                            checked ? "border-[#3D52A0] bg-[#3D52A0] text-white" : "border-slate-300"
                          }`}
                        >
                          {checked && <Check className="h-2.5 w-2.5" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, tone = "blue" }: { title: string; tone?: string }) {
  const toneBg =
    tone === "amber"
      ? "bg-[#6a3810] text-amber-50"
      : tone === "indigo"
      ? "bg-[#293252] text-indigo-50"
      : tone === "rose"
      ? "bg-[#681822] text-rose-50"
      : "bg-[#1b264f] text-blue-50";
  return (
    <div className={`p-2.5 px-4 font-mono-report font-extrabold text-[11px] tracking-wider uppercase ${toneBg}`}>
      {title}
    </div>
  );
}

function SpecRow({
  label,
  detail,
  values,
  rawValues,
  deltaType = "none",
  columnCount = 2,
  highlightBest,
}: {
  label: string;
  detail?: string;
  values: string[];
  rawValues?: (number | null)[];
  deltaType?: "percentage" | "minutes" | "count" | "rate" | "evacuation" | "none";
  columnCount?: 2 | 3;
  highlightBest?: (val: string, index: number) => boolean;
}) {
  const colWidth = columnCount === 2 ? "col-span-4" : "col-span-3";
  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className={`${colWidth} p-3.5 border-r border-[#adbBda]/40 bg-slate-50/40`}>
        <p className="font-bold text-slate-900">{label}</p>
        {detail && <p className="text-[10px] text-slate-400">{detail}</p>}
      </div>
      {values.map((val, idx) => {
        const isHighlighted = highlightBest ? highlightBest(val, idx) : false;

        // Calculate Delta against Column 1 (idx === 0)
        let deltaBadge: React.ReactNode = null;
        if (
          idx >= 1 &&
          rawValues &&
          rawValues[0] !== null &&
          rawValues[0] !== undefined &&
          rawValues[idx] !== null &&
          rawValues[idx] !== undefined
        ) {
          const base = rawValues[0]!;
          const current = rawValues[idx]!;
          const diff = current - base;

          if (deltaType === "percentage") {
            if (Math.abs(diff) >= 0.001) {
              const isBetter = diff > 0;
              deltaBadge = (
                <span
                  className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isBetter ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {isBetter ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {diff > 0 ? `+${diff.toFixed(3)}%` : `${diff.toFixed(3)}%`}
                </span>
              );
            }
          } else if (deltaType === "minutes" || deltaType === "evacuation") {
            if (Math.abs(diff) >= 1) {
              const isBetter = diff < 0; // Fewer minutes of downtime/evacuation is better
              deltaBadge = (
                <span
                  className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isBetter ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {diff > 0 ? `+${diff.toFixed(0)} min` : `${diff.toFixed(0)} min`}
                </span>
              );
            }
          } else if (deltaType === "rate") {
            if (Math.abs(diff) >= 0.001) {
              const isBetter = diff < 0;
              deltaBadge = (
                <span
                  className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isBetter ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {diff > 0 ? `+${diff.toFixed(3)}%` : `${diff.toFixed(3)}%`}
                </span>
              );
            }
          } else if (deltaType === "count") {
            if (Math.abs(diff) >= 1) {
              const isBetter = diff < 0;
              deltaBadge = (
                <span
                  className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isBetter ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {diff > 0 ? `+${diff}` : `${diff}`}
                </span>
              );
            }
          }
        }

        return (
          <div
            key={idx}
            className={`${colWidth} p-3.5 border-r last:border-r-0 border-[#adbBda]/40 flex items-center justify-between ${
              isHighlighted ? "bg-emerald-50/70 font-extrabold text-emerald-950" : "text-slate-800"
            }`}
          >
            <div className="flex items-center flex-wrap gap-1">
              <span className={val === "Select dates" ? "text-slate-400 italic text-[11px]" : "font-semibold"}>
                {val}
              </span>
              {deltaBadge}
            </div>
            {isHighlighted && (
              <span className="rounded bg-emerald-100 text-emerald-800 px-1 py-0.2 text-[9px] font-extrabold shrink-0">
                Best
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RideSpecRow({
  rideCode,
  rideName,
  results,
  activeSlots,
  isCalculated,
  columnCount = 2,
}: {
  rideCode: string;
  rideName: string;
  results: Array<any>;
  activeSlots: SlotConfig[];
  isCalculated: boolean;
  columnCount?: 2 | 3;
}) {
  const colWidth = columnCount === 2 ? "col-span-4" : "col-span-3";
  const rideStats = results.map(res => {
    if (!res || !res.topRides) return null;
    return res.topRides.find((r: any) => r.rideCode === rideCode) ?? null;
  });

  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className={`${colWidth} p-3 border-r border-[#adbBda]/40 bg-slate-50/40 flex items-center gap-2`}>
        <span className="font-mono-report font-extrabold text-[#3D52A0] text-[11px] w-12 shrink-0">
          {rideCode}
        </span>
        <span className="truncate text-slate-700 text-[11px] font-medium" title={rideName}>
          {rideName}
        </span>
      </div>
      {rideStats.map((stat, idx) => (
        <div
          key={idx}
          className={`${colWidth} p-3 border-r last:border-r-0 border-[#adbBda]/40 text-xs`}
        >
          {!isCalculated || activeSlots[idx].dateKeys.size === 0 ? (
            <span className="text-slate-300 italic text-[11px]">—</span>
          ) : stat ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">
                  {stat.availabilityPercentage.toFixed(2)}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {stat.minutes} min ({stat.events} inc)
                </span>
              </div>
              {stat.evacuationMinutes > 0 && (
                <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-800 bg-amber-50">
                  evac {stat.evacuationMinutes}m
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-slate-400 text-[11px]">100% (0 min)</span>
          )}
        </div>
      ))}
    </div>
  );
}

function WeekdaySpecRow({
  weekday,
  results,
  isCalculated,
  columnCount = 2,
}: {
  weekday: string;
  results: Array<any>;
  isCalculated: boolean;
  columnCount?: 2 | 3;
}) {
  const colWidth = columnCount === 2 ? "col-span-4" : "col-span-3";
  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className={`${colWidth} p-3 border-r border-[#adbBda]/40 bg-slate-50/40 font-bold text-slate-800`}>
        {weekday}
      </div>
      {results.map((res, idx) => {
        const point = res?.weekdayPattern?.find((w: any) => w.weekday === weekday);
        return (
          <div
            key={idx}
            className={`${colWidth} p-3 border-r last:border-r-0 border-[#adbBda]/40 text-xs font-mono`}
          >
            {!isCalculated ? "—" : point ? `${point.minutes} min (${point.events} events)` : "—"}
          </div>
        );
      })}
    </div>
  );
}
