import React, { useState } from "react";
import { SlidersHorizontal, RotateCcw, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SeverityThresholds = {
  elevated: number; // default: 30
  high: number;     // default: 60
  critical: number; // default: 120
};

export const DEFAULT_THRESHOLDS: SeverityThresholds = {
  elevated: 30,
  high: 60,
  critical: 120,
};

export const SEVERITY_COLORS = {
  monitor: "#7091E6",   // light blue
  elevated: "#3D52A0",  // deep blue
  high: "#E67E36",      // orange
  critical: "#D84A5D",  // red/crimson
};

export function getSeverityForMinutes(minutes: number, thresholds: SeverityThresholds = DEFAULT_THRESHOLDS) {
  if (minutes >= thresholds.critical) {
    return {
      level: "critical",
      label: `Critical · ${thresholds.critical}+ min`,
      color: SEVERITY_COLORS.critical,
    };
  }
  if (minutes >= thresholds.high) {
    return {
      level: "high",
      label: `High · ${thresholds.high}–${thresholds.critical - 1} min`,
      color: SEVERITY_COLORS.high,
    };
  }
  if (minutes >= thresholds.elevated) {
    return {
      level: "elevated",
      label: `Elevated · ${thresholds.elevated}–${thresholds.high - 1} min`,
      color: SEVERITY_COLORS.elevated,
    };
  }
  return {
    level: "monitor",
    label: `Monitor · under ${thresholds.elevated} min`,
    color: SEVERITY_COLORS.monitor,
  };
}

interface SeverityThresholdControlProps {
  thresholds: SeverityThresholds;
  onChange: (thresholds: SeverityThresholds) => void;
}

export function SeverityThresholdControl({ thresholds, onChange }: SeverityThresholdControlProps) {
  const [open, setOpen] = useState(false);
  const [tempElevated, setTempElevated] = useState(thresholds.elevated);
  const [tempHigh, setTempHigh] = useState(thresholds.high);
  const [tempCritical, setTempCritical] = useState(thresholds.critical);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setTempElevated(thresholds.elevated);
      setTempHigh(thresholds.high);
      setTempCritical(thresholds.critical);
      setError(null);
    }
    setOpen(isOpen);
  };

  const handleApply = () => {
    if (tempElevated <= 0) {
      setError("Elevated threshold must be greater than 0.");
      return;
    }
    if (tempHigh <= tempElevated) {
      setError("High threshold must be greater than Elevated threshold.");
      return;
    }
    if (tempCritical <= tempHigh) {
      setError("Critical threshold must be greater than High threshold.");
      return;
    }
    onChange({
      elevated: tempElevated,
      high: tempHigh,
      critical: tempCritical,
    });
    setOpen(false);
  };

  const handleReset = () => {
    setTempElevated(DEFAULT_THRESHOLDS.elevated);
    setTempHigh(DEFAULT_THRESHOLDS.high);
    setTempCritical(DEFAULT_THRESHOLDS.critical);
    setError(null);
    onChange(DEFAULT_THRESHOLDS);
    setOpen(false);
  };

  const isCustomized =
    thresholds.elevated !== DEFAULT_THRESHOLDS.elevated ||
    thresholds.high !== DEFAULT_THRESHOLDS.high ||
    thresholds.critical !== DEFAULT_THRESHOLDS.critical;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 px-2.5 text-[11px] font-bold transition-all ${
            isCustomized
              ? "border-[#3D52A0] bg-indigo-50 text-[#3D52A0] hover:bg-indigo-100"
              : "border-slate-300 bg-white/70 text-slate-700 hover:bg-slate-100"
          }`}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 text-[#3D52A0]" />
          {isCustomized ? "Severity: Custom" : "Configure Severity"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-[#fbfbff] border-[#adbBda]/80 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-[#293252] flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#3D52A0]" />
            Configure Severity Thresholds
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Adjust minute thresholds to dynamically recolour chart bars and ride ranking metrics.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 font-semibold">
            {error}
          </div>
        )}

        {/* Live Color Preview Bar */}
        <div className="space-y-1.5 pt-1">
          <Label className="text-[11px] font-bold text-slate-600">Threshold Colour Spectrum</Label>
          <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold text-white">
            <div
              className="rounded-md py-1.5 px-1 truncate shadow-xs"
              style={{ backgroundColor: SEVERITY_COLORS.monitor }}
            >
              &lt; {tempElevated}m
            </div>
            <div
              className="rounded-md py-1.5 px-1 truncate shadow-xs"
              style={{ backgroundColor: SEVERITY_COLORS.elevated }}
            >
              {tempElevated}–{tempHigh - 1}m
            </div>
            <div
              className="rounded-md py-1.5 px-1 truncate shadow-xs"
              style={{ backgroundColor: SEVERITY_COLORS.high }}
            >
              {tempHigh}–{tempCritical - 1}m
            </div>
            <div
              className="rounded-md py-1.5 px-1 truncate shadow-xs"
              style={{ backgroundColor: SEVERITY_COLORS.critical }}
            >
              {tempCritical}+m
            </div>
          </div>
        </div>

        {/* Threshold Inputs */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.elevated }} />
              <div>
                <p className="text-xs font-bold text-slate-800">Elevated threshold</p>
                <p className="text-[10px] text-slate-500">Upper bound for Monitor (default: 30 min)</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 w-24">
              <Input
                type="number"
                min={5}
                max={tempHigh - 1 || 100}
                value={tempElevated}
                onChange={e => setTempElevated(parseInt(e.target.value, 10) || 0)}
                className="h-8 text-right font-mono font-bold text-xs"
              />
              <span className="text-xs text-slate-500 font-semibold">min</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.high }} />
              <div>
                <p className="text-xs font-bold text-slate-800">High threshold</p>
                <p className="text-[10px] text-slate-500">Upper bound for Elevated (default: 60 min)</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 w-24">
              <Input
                type="number"
                min={tempElevated + 1}
                max={tempCritical - 1 || 200}
                value={tempHigh}
                onChange={e => setTempHigh(parseInt(e.target.value, 10) || 0)}
                className="h-8 text-right font-mono font-bold text-xs"
              />
              <span className="text-xs text-slate-500 font-semibold">min</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.critical }} />
              <div>
                <p className="text-xs font-bold text-slate-800">Critical threshold</p>
                <p className="text-[10px] text-slate-500">Downtime marked Critical (default: 120 min)</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 w-24">
              <Input
                type="number"
                min={tempHigh + 1}
                max={999}
                value={tempCritical}
                onChange={e => setTempCritical(parseInt(e.target.value, 10) || 0)}
                className="h-8 text-right font-mono font-bold text-xs"
              />
              <span className="text-xs text-slate-500 font-semibold">min</span>
            </div>
          </div>
        </div>

        {/* Presets */}
        <div className="pt-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Presets</Label>
          <div className="mt-1.5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTempElevated(30);
                setTempHigh(60);
                setTempCritical(120);
              }}
              className="h-6 text-[10px] px-2"
            >
              Default (30/60/120)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTempElevated(15);
                setTempHigh(30);
                setTempCritical(60);
              }}
              className="h-6 text-[10px] px-2"
            >
              Strict (15/30/60)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTempElevated(45);
                setTempHigh(90);
                setTempCritical(180);
              }}
              className="h-6 text-[10px] px-2"
            >
              Relaxed (45/90/180)
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 text-xs text-slate-600 hover:text-slate-900"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset Defaults
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="h-8 text-xs bg-[#3D52A0] hover:bg-[#293252] text-white font-bold"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Apply Thresholds
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SeverityKeyBar({
  thresholds = DEFAULT_THRESHOLDS,
  onConfigure,
}: {
  thresholds?: SeverityThresholds;
  onConfigure?: (thresholds: SeverityThresholds) => void;
}) {
  const sampleValues = [0, thresholds.elevated, thresholds.high, thresholds.critical];
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] font-semibold text-slate-600">
        {sampleValues.map(minutes => {
          const severity = getSeverityForMinutes(minutes, thresholds);
          return (
            <span key={minutes} className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: severity.color }} />
              {severity.label}
            </span>
          );
        })}
      </div>
      {onConfigure && (
        <SeverityThresholdControl thresholds={thresholds} onChange={onConfigure} />
      )}
    </div>
  );
}
