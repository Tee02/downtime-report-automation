import React, { useState } from "react";
import { Check, ChevronDown, Filter, Layers, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export const FLEET_RIDES: Array<[string, string]> = [
  ["ACR", "Acorn Adventure"],
  ["BWZ", "Big Weld's Zeppelin"],
  ["BSC", "Blue Sky Carousel"],
  ["AFP", "Alpha Fighter Pilots"],
  ["ESD", "ESD: Global Defender"],
  ["EHF", "Epic Hummingbird Flyers"],
  ["VTM", "Epic Voyage to Moonhaven"],
  ["ETI", "Expedition Thin Ice"],
  ["IDD", "Independence Day: Defiance"],
  ["MFZ", "Mammoth Fun Zone"],
  ["BCT (EV)", "Boot Camp: Extreme Vert"],
  ["BCT (RC)", "Boot Camp: Ropes Course"],
  ["BCT (UZ)", "Boot Camp: Unharnessed Zones"],
  ["BCT (ZC)", "Boot Camp: Zip Coaster"],
  ["NTM", "Night At The Museum"],
  ["PTA", "Invasion of the Planet of the Apes"],
  ["RCC", "Rio Carnaval Chaos"],
  ["RTR", "Rivet Town Roller"],
  ["SAG", "Samba Gliders"],
  ["SRS", "Sid's Rock 'N' Slide"],
  ["TTC", "Terraform Tower Challenge"],
];

interface RideCombinationSwitchProps {
  selectedRideCodes: string[];
  onChange: (codes: string[]) => void;
}

export function RideCombinationSwitch({
  selectedRideCodes,
  onChange,
}: RideCombinationSwitchProps) {
  const [mode, setMode] = useState<"all" | "custom">(() =>
    selectedRideCodes.length > 0 ? "custom" : "all"
  );
  const [search, setSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleSwitchToAll = () => {
    setMode("all");
    onChange([]);
  };

  const handleSwitchToCustom = () => {
    setMode("custom");
    if (selectedRideCodes.length === 0) {
      setPopoverOpen(true);
    }
  };

  const toggleRide = (code: string) => {
    if (selectedRideCodes.includes(code)) {
      const next = selectedRideCodes.filter(c => c !== code);
      onChange(next);
    } else {
      onChange([...selectedRideCodes, code]);
    }
  };

  const handleSelectAllCustom = () => {
    onChange(FLEET_RIDES.map(([code]) => code));
  };

  const handleClearCustom = () => {
    onChange([]);
  };

  const filteredRides = FLEET_RIDES.filter(([code, name]) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-[#3D52A0]">
              02 · Focus the fleet
            </p>
            <h2 className="mt-0.5 text-base font-extrabold tracking-tight text-slate-900">
              Ride combination
            </h2>
          </div>
          <Badge
            variant="outline"
            className="border-[#8697c4]/60 bg-white/70 text-[#3D52A0] text-[11px] font-bold shrink-0"
          >
            {mode === "all" || selectedRideCodes.length === 0
              ? "All 21 Rides"
              : `${selectedRideCodes.length} Selected`}
          </Badge>
        </div>

        {/* Space-Saving Button Switch (Segmented Control) */}
        <div className="mt-3 grid grid-cols-2 p-1 bg-slate-200/80 rounded-xl border border-slate-300/70 shadow-inner">
          <button
            type="button"
            onClick={handleSwitchToAll}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              mode === "all"
                ? "bg-white text-[#293252] shadow-sm font-extrabold border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-[#3D52A0]" />
            All Rides (Default)
          </button>
          <button
            type="button"
            onClick={handleSwitchToCustom}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              mode === "custom"
                ? "bg-white text-[#293252] shadow-sm font-extrabold border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Filter className="h-3.5 w-3.5 text-[#3D52A0]" />
            Select Rides
          </button>
        </div>

        {/* Mode Explanations and Drop Box */}
        <div className="mt-3">
          {mode === "all" ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                Full fleet analysis active:
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                All 21 attractions are included across all metrics, trends, and incident logs. Toggle to the right to filter specific rides.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Drop Box Popover Trigger */}
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-9 text-xs border-[#8697c4]/70 bg-white hover:bg-slate-50 font-normal shadow-xs"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 text-[#3D52A0] shrink-0" />
                      {selectedRideCodes.length === 0 ? (
                        <span className="text-slate-400">Click to choose rides from fleet...</span>
                      ) : (
                        <span className="font-bold text-slate-800 truncate">
                          {selectedRideCodes.length} ride{selectedRideCodes.length === 1 ? "" : "s"} selected ({selectedRideCodes.slice(0, 3).join(", ")}{selectedRideCodes.length > 3 ? "..." : ""})
                        </span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 p-3 bg-white border-[#adbBda]/80 shadow-2xl rounded-xl"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-900">
                        Select Fleet Rides
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSelectAllCustom}
                          className="h-6 px-1.5 text-[10px] font-bold text-[#3D52A0]"
                        >
                          All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearCustom}
                          className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {/* Search box */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search ride name or code..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-7 pl-8 text-xs bg-slate-50"
                      />
                    </div>

                    {/* List of 21 rides */}
                    <div className="max-h-52 overflow-y-auto space-y-1 pr-1 text-xs">
                      {filteredRides.map(([code, name]) => {
                        const isChecked = selectedRideCodes.includes(code);
                        return (
                          <label
                            key={code}
                            onClick={() => toggleRide(code)}
                            className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-indigo-50/90 text-[#293252] font-semibold"
                                : "hover:bg-slate-100 text-slate-700"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                isChecked
                                  ? "border-[#3D52A0] bg-[#3D52A0] text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {isChecked && <Check className="h-3 w-3" />}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-[#3D52A0] w-12">
                              {code}
                            </span>
                            <span className="truncate text-[11px] text-slate-800">
                              {name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Active selection pills */}
              {selectedRideCodes.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pt-1">
                  {selectedRideCodes.map(code => {
                    return (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-[#3D52A0]"
                      >
                        <span>{code}</span>
                        <button
                          type="button"
                          onClick={() => toggleRide(code)}
                          className="hover:text-rose-600 rounded"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
