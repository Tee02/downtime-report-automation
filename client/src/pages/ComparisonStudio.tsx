import React, { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Calendar,
  Check,
  ChevronDown,
  Columns3,
  Filter,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";

type SlotConfig = {
  id: string;
  name: string;
  dateKeys: Set<string>;
  rideCodes: string[];
};

function displayDateShort(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function ComparisonStudio() {
  const { data: reports, isLoading: reportsLoading, error: reportsError } =
    trpc.savedReports.list.useQuery();

  const availableDateKeys = useMemo(
    () => Array.from(new Set((reports ?? []).map(r => r.reportDate))).sort(),
    [reports]
  );

  // Three slots configuration
  const [slots, setSlots] = useState<SlotConfig[]>([
    {
      id: "slot-1",
      name: "Scenario 1: All Fleet",
      dateKeys: new Set(),
      rideCodes: [],
    },
    {
      id: "slot-2",
      name: "Scenario 2: Recent Dates",
      dateKeys: new Set(),
      rideCodes: [],
    },
    {
      id: "slot-3",
      name: "Scenario 3: Outdoor Focus",
      dateKeys: new Set(),
      rideCodes: ["RCC", "RTR", "SAG", "SRS", "TTC", "BWZ"],
    },
  ]);

  // Prepopulate sensible defaults when reports load
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (availableDateKeys.length && !initialized) {
      const half = Math.ceil(availableDateKeys.length / 2);
      setSlots([
        {
          id: "slot-1",
          name: "All Dates (Full Fleet)",
          dateKeys: new Set(availableDateKeys),
          rideCodes: [],
        },
        {
          id: "slot-2",
          name: "Period A (Earlier Dates)",
          dateKeys: new Set(availableDateKeys.slice(0, half)),
          rideCodes: [],
        },
        {
          id: "slot-3",
          name: "Period B (Outdoor Rides)",
          dateKeys: new Set(availableDateKeys.slice(half)),
          rideCodes: ["RCC", "RTR", "SAG", "SRS", "TTC", "BWZ"],
        },
      ]);
      setInitialized(true);
    }
  }, [availableDateKeys, initialized]);

  // Prepare report IDs for each slot
  const slotReportIds = useMemo(() => {
    return slots.map(slot => {
      return (reports ?? [])
        .filter(r => slot.dateKeys.has(r.reportDate))
        .map(r => r.id);
    });
  }, [slots, reports]);

  // Run 3 queries for the 3 columns
  const query1 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[0], rideCodes: slots[0].rideCodes },
    { enabled: slotReportIds[0].length > 0 }
  );
  const query2 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[1], rideCodes: slots[1].rideCodes },
    { enabled: slotReportIds[1].length > 0 }
  );
  const query3 = trpc.analysis.get.useQuery(
    { reportIds: slotReportIds[2], rideCodes: slots[2].rideCodes },
    { enabled: slotReportIds[2].length > 0 }
  );

  const results = [query1.data, query2.data, query3.data];
  const queries = [query1, query2, query3];

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
      copy[index] = { ...copy[index], dateKeys };
      return copy;
    });
  };

  const updateSlotRides = (index: number, rideCodes: string[]) => {
    setSlots(current => {
      const copy = [...current];
      copy[index] = { ...copy[index], rideCodes };
      return copy;
    });
  };

  const resetSlot = (index: number) => {
    setSlots(current => {
      const copy = [...current];
      copy[index] = {
        ...copy[index],
        dateKeys: new Set(availableDateKeys),
        rideCodes: [],
      };
      return copy;
    });
  };

  // Best availability among valid results
  const bestAvailability = useMemo(() => {
    const avails = results.map(r => (r ? 100 - r.averageDowntimePercentage : null));
    const valid = avails.filter((v): v is number => v !== null);
    return valid.length ? Math.max(...valid) : null;
  }, [results]);

  // Lowest downtime minutes among valid results
  const lowestDowntime = useMemo(() => {
    const times = results.map(r => (r ? r.totalTechnicalMinutes : null));
    const valid = times.filter((v): v is number => v !== null);
    return valid.length ? Math.min(...valid) : null;
  }, [results]);

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
              <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">
                Downtime Comparison Studio
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Compare three operational scenarios side by side. Customize dates and ride combinations for each column to benchmark performance metrics, ride availability, and incident logs in a structured comparison table.
              </p>
            </div>
            <div className="max-w-xs rounded-2xl border border-[#8697c4]/45 bg-white/65 p-3.5 text-xs text-slate-600 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 font-bold text-[#293252] mb-1">
                <Columns3 className="h-4 w-4 text-[#3D52A0]" />
                3-Column Comparison
              </div>
              Data is displayed in structured table format with comparative highlighting.
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
            {/* Slot Configuration Header Cards (3 columns) */}
            <div className="grid gap-4 md:grid-cols-3">
              {slots.map((slot, index) => (
                <SlotConfigCard
                  key={slot.id}
                  index={index}
                  slot={slot}
                  availableDateKeys={availableDateKeys}
                  onNameChange={name => updateSlotName(index, name)}
                  onDatesChange={keys => updateSlotDates(index, keys)}
                  onRidesChange={rides => updateSlotRides(index, rides)}
                  onReset={() => resetSlot(index)}
                  isLoading={queries[index].isLoading}
                />
              ))}
            </div>

            {/* GSMArena-Style Side-by-Side Comparison Table */}
            <div className="overflow-hidden rounded-2xl border border-[#adbBda]/70 bg-white shadow-[0_14px_35px_rgba(61,82,160,0.10)]">
              {/* Sticky Column Header */}
              <div className="grid grid-cols-12 bg-[#ede8f5] border-b border-[#adbBda]/60 sticky top-0 z-20 text-xs font-extrabold text-slate-800">
                <div className="col-span-3 p-4 flex items-center gap-2 border-r border-[#adbBda]/40 text-slate-700 uppercase tracking-wider text-[11px]">
                  <Columns3 className="h-4 w-4 text-[#3D52A0]" />
                  Metric / Category
                </div>
                {slots.map((slot, idx) => (
                  <div
                    key={slot.id}
                    className={`col-span-3 p-3.5 border-r last:border-r-0 border-[#adbBda]/40 ${
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
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 font-normal">
                      <span>{slot.dateKeys.size} dates</span>
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
                values={results.map(r =>
                  r ? (100 - r.averageDowntimePercentage).toFixed(3) + "%" : "—"
                )}
                highlightBest={(val, idx) => {
                  const num = parseFloat(val);
                  return !isNaN(num) && bestAvailability !== null && Math.abs(num - bestAvailability) < 0.005;
                }}
              />
              <SpecRow
                label="Total Technical Downtime"
                detail="11-1 mechanical/electrical"
                values={results.map(r => (r ? `${r.totalTechnicalMinutes} min` : "—"))}
                highlightBest={(val, idx) => {
                  const num = parseInt(val, 10);
                  return !isNaN(num) && lowestDowntime !== null && num === lowestDowntime;
                }}
              />
              <SpecRow
                label="Average Downtime Rate"
                detail="Daily downtime percentage"
                values={results.map(r => (r ? `${r.averageDowntimePercentage.toFixed(3)}%` : "—"))}
              />
              <SpecRow
                label="Reporting Days"
                detail="Sample size"
                values={results.map(r => (r ? `${r.selectedDayCount} days` : "—"))}
              />
              <SpecRow
                label="Rides in Scope"
                detail="Operating fleet count"
                values={results.map(r => (r ? `${r.selectedRideCount} rides` : "—"))}
              />

              {/* Section 2: Interruptions & Evacuations */}
              <SectionHeader title="INTERRUPTIONS & EVACUATIONS" tone="amber" />
              <SpecRow
                label="Recorded Incidents"
                detail="Total stoppage events"
                values={results.map(r => (r ? `${r.totalEvents}` : "—"))}
              />
              <SpecRow
                label="Daily Incident Average"
                detail="Incidents per operating day"
                values={results.map(r => (r ? `${r.averageEventsPerDay.toFixed(1)} / day` : "—"))}
              />
              <SpecRow
                label="Average Interruption"
                detail="Duration per incident"
                values={results.map(r => (r ? `${r.averageIncidentMinutes.toFixed(1)} min` : "—"))}
              />
              <SpecRow
                label="Evacuation Time (11-7/11-17)"
                detail="Total evacuation duration"
                values={results.map(r => (r ? `${r.totalEvacuationMinutes} min` : "—"))}
              />
              <SpecRow
                label="Evacuation Occurrences"
                detail="Times passengers unloaded"
                values={results.map(r => (r ? `${r.totalEvacuationEvents} times` : "—"))}
              />
              <SpecRow
                label="Peak Downtime Day"
                detail="Day with highest stoppage"
                values={results.map(r =>
                  r && r.peakDay ? `${r.peakDay.label} (${r.peakDay.minutes}m)` : "—"
                )}
              />

              {/* Section 3: Ride-by-Ride Breakdown */}
              <SectionHeader title="FLEET RIDE BREAKDOWN (ALL 21 ATTRACTIONS)" tone="indigo" />
              {FLEET_RIDES.map(([code, name]) => (
                <RideSpecRow
                  key={code}
                  rideCode={code}
                  rideName={name}
                  results={results}
                />
              ))}

              {/* Section 4: Day of Week Pattern */}
              <SectionHeader title="DAY OF WEEK PATTERN (MON – SUN)" tone="slate" />
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                <WeekdaySpecRow key={day} weekday={day} results={results} />
              ))}

              {/* Section 5: Ride Incident Logs Comparison */}
              <SectionHeader title="RIDE INCIDENT LOGS SIDE-BY-SIDE" tone="rose" />
              <div className="grid grid-cols-12 divide-x divide-[#adbBda]/40 bg-slate-50/50">
                <div className="col-span-3 p-4 text-xs font-bold text-slate-700">
                  <p>Chronological Logs</p>
                  <p className="mt-1 text-[10px] text-slate-400 font-normal">
                    Sorted by ride code, including technical, weather, and Dark Day entries.
                  </p>
                </div>
                {results.map((res, idx) => (
                  <div key={idx} className="col-span-3 p-3 max-h-96 overflow-y-auto space-y-3">
                    {res?.rideIncidentGroups?.length ? (
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

  const filteredRides = FLEET_RIDES.filter(([c, n]) => {
    if (!searchRide) return true;
    const q = searchRide.toLowerCase();
    return c.toLowerCase().includes(q) || n.toLowerCase().includes(q);
  });

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
            title="Reset to all dates and fleet"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>

        {/* Controls: Select Dates + Select Rides Popovers */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Date Selector Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-between text-xs px-2.5 border-[#8697c4]/60 bg-white font-semibold"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Calendar className="h-3.5 w-3.5 text-[#3D52A0]" />
                  <span className="truncate">{slot.dateKeys.size} Dates</span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 bg-white border-[#adbBda]/80 shadow-xl rounded-xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-900">Select Dates</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDatesChange(new Set(availableDateKeys))}
                      className="h-5 px-1.5 text-[10px] text-[#3D52A0] font-bold"
                    >
                      All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDatesChange(new Set())}
                      className="h-5 px-1.5 text-[10px] text-slate-400"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                  {availableDateKeys.map(key => {
                    const checked = slot.dateKeys.has(key);
                    return (
                      <label
                        key={key}
                        onClick={() => {
                          const next = new Set(slot.dateKeys);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          onDatesChange(next);
                        }}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer ${
                          checked ? "bg-indigo-50 font-bold text-[#293252]" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span>{displayDateShort(key)}</span>
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
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
                    {slot.rideCodes.length === 0 ? "All 21" : `${slot.rideCodes.length} Rides`}
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
                      onClick={() => onRidesChange(FLEET_RIDES.map(([c]) => c))}
                      className="h-5 px-1.5 text-[10px] text-[#3D52A0] font-bold"
                    >
                      All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRidesChange([])}
                      className="h-5 px-1.5 text-[10px] text-slate-400"
                    >
                      Fleet (Default)
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
                  <Input
                    placeholder="Search ride..."
                    value={searchRide}
                    onChange={e => setSearchRide(e.target.value)}
                    className="h-7 pl-7 text-xs bg-slate-50"
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
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-mono text-[10px] text-[#3D52A0] font-bold w-10">
                            {code}
                          </span>
                          <span className="truncate text-[11px]">{name}</span>
                        </div>
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
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

        {isLoading && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pt-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-[#3D52A0]" />
            Recalculating column…
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  title,
  tone = "blue",
}: {
  title: string;
  tone?: "blue" | "amber" | "indigo" | "slate" | "rose";
}) {
  const toneClasses = {
    blue: "bg-blue-900 text-blue-50",
    amber: "bg-amber-900 text-amber-50",
    indigo: "bg-indigo-900 text-indigo-50",
    slate: "bg-slate-800 text-slate-50",
    rose: "bg-rose-950 text-rose-50",
  };
  return (
    <div className={`px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] ${toneClasses[tone]}`}>
      {title}
    </div>
  );
}

function SpecRow({
  label,
  detail,
  values,
  highlightBest,
}: {
  label: string;
  detail?: string;
  values: string[];
  highlightBest?: (val: string, index: number) => boolean;
}) {
  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className="col-span-3 p-3.5 border-r border-[#adbBda]/40 bg-slate-50/40">
        <p className="font-bold text-slate-900">{label}</p>
        {detail && <p className="text-[10px] text-slate-400">{detail}</p>}
      </div>
      {values.map((val, idx) => {
        const isHighlighted = highlightBest ? highlightBest(val, idx) : false;
        return (
          <div
            key={idx}
            className={`col-span-3 p-3.5 border-r last:border-r-0 border-[#adbBda]/40 flex items-center justify-between ${
              isHighlighted ? "bg-emerald-50/70 font-extrabold text-emerald-950" : "text-slate-800"
            }`}
          >
            <span className="font-semibold">{val}</span>
            {isHighlighted && (
              <span className="rounded bg-emerald-100 text-emerald-800 px-1 py-0.2 text-[9px] font-extrabold">
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
}: {
  rideCode: string;
  rideName: string;
  results: Array<any>;
}) {
  const rideStats = results.map(res => {
    if (!res || !res.topRides) return null;
    return res.topRides.find((r: any) => r.rideCode === rideCode) ?? null;
  });

  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className="col-span-3 p-3 border-r border-[#adbBda]/40 bg-slate-50/40 flex items-center gap-2">
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
          className="col-span-3 p-3 border-r last:border-r-0 border-[#adbBda]/40 text-xs"
        >
          {stat ? (
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
            <span className="text-slate-400 text-[11px]">N/A</span>
          )}
        </div>
      ))}
    </div>
  );
}

function WeekdaySpecRow({
  weekday,
  results,
}: {
  weekday: string;
  results: Array<any>;
}) {
  return (
    <div className="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
      <div className="col-span-3 p-3 border-r border-[#adbBda]/40 bg-slate-50/40 font-bold text-slate-800">
        {weekday}
      </div>
      {results.map((res, idx) => {
        const point = res?.weekdayPattern?.find((w: any) => w.weekday === weekday);
        return (
          <div
            key={idx}
            className="col-span-3 p-3 border-r last:border-r-0 border-[#adbBda]/40 text-xs font-mono"
          >
            {point ? `${point.minutes} min (${point.events} events)` : "—"}
          </div>
        );
      })}
    </div>
  );
}
