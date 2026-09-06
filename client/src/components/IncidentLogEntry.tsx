import React from "react";

export type IncidentLogEntryProps = {
  kind: "technical" | "weather" | "darkDay";
  dateLabel: string;
  description: string;
  durationLabel?: string;
  timeRange?: string;
  evacuationLabel?: string;
  evacuationRange?: string;
};

export function IncidentLogEntry({
  kind,
  dateLabel,
  description,
  durationLabel,
  timeRange,
  evacuationLabel,
  evacuationRange,
}: IncidentLogEntryProps) {
  if (kind === "darkDay") {
    return (
      <div className="font-mono-report text-xs leading-relaxed py-1 border-b border-slate-100 last:border-b-0 text-slate-800">
        <span className="font-bold text-slate-900">*{dateLabel}, </span>
        <span className="font-bold text-red-600">Dark Day</span>
        <span>.</span>
      </div>
    );
  }

  if (kind === "weather") {
    return (
      <div className="font-mono-report text-xs leading-relaxed py-1 border-b border-slate-100 last:border-b-0 text-slate-800">
        <span className="font-bold text-slate-900">*{dateLabel}, </span>
        <span className="font-bold text-red-600">{description}</span>
        <span>, {durationLabel} </span>
        <span className="text-slate-600">({timeRange})</span>
        <span>, </span>
        <span className="font-bold text-red-600">Moderated</span>
        <span>.</span>
      </div>
    );
  }

  return (
    <div className="font-mono-report text-xs leading-relaxed py-1 border-b border-slate-100 last:border-b-0 text-slate-800">
      <span className="font-bold text-slate-900">*{dateLabel}, </span>
      <span className="font-bold text-red-600">{description}</span>
      <span>, {durationLabel} </span>
      <span className="text-slate-600">({timeRange})</span>
      {evacuationLabel && evacuationRange ? (
        <>
          <span>, </span>
          <span className="font-bold text-red-600">{evacuationLabel}</span>
          <span> </span>
          <span className="text-slate-600">({evacuationRange})</span>
        </>
      ) : null}
      <span>.</span>
    </div>
  );
}
