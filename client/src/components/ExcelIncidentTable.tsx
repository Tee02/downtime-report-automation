import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Check, Table as TableIcon, FileSpreadsheet } from "lucide-react";

export type IncidentLogItem = {
  id: string;
  rideCode?: string;
  attraction?: string;
  dateLabel: string;
  description: string;
  durationLabel?: string;
  timeRange?: string;
  evacuationLabel?: string;
  evacuationRange?: string;
  kind: "technical" | "weather" | "darkDay";
};

export type RideIncidentGroup = {
  rideCode: string;
  attraction: string;
  logs: IncidentLogItem[];
};

interface ExcelIncidentTableProps {
  groups: RideIncidentGroup[];
}

export function ExcelIncidentTable({ groups }: ExcelIncidentTableProps) {
  const [copied, setCopied] = useState(false);

  const allRows: Array<IncidentLogItem & { rowNumber: number }> = [];
  let counter = 1;
  for (const group of groups) {
    for (const log of group.logs) {
      allRows.push({
        ...log,
        rideCode: log.rideCode || group.rideCode,
        attraction: log.attraction || group.attraction,
        rowNumber: counter++,
      });
    }
  }

  const handleCopyForExcel = async () => {
    if (allRows.length === 0) {
      toast.error("No incident logs available to copy.");
      return;
    }

    const rowsHtml = allRows
      .map(row => {
        let descHtml = "";
        if (row.kind === "darkDay") {
          descHtml = `<span style="color: #FF0000; font-weight: bold;">Dark Day.</span>`;
        } else if (row.kind === "weather") {
          descHtml = `<span style="color: #FF0000; font-weight: bold;">${row.description} (Moderated)</span>`;
        } else {
          descHtml = `<span style="color: #FF0000; font-weight: bold;">${row.description}</span>`;
        }

        let evacHtml = "";
        if (row.evacuationLabel) {
          const evacFull = row.evacuationRange
            ? `${row.evacuationLabel} (${row.evacuationRange})`
            : row.evacuationLabel;
          evacHtml = `<span style="color: #FF0000; font-weight: bold;">${evacFull}</span>`;
        }

        return `
        <tr>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: center; font-weight: bold; font-family: Calibri, Arial, sans-serif;">${row.rideCode}</td>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: center; font-family: Calibri, Arial, sans-serif;">${row.dateLabel}</td>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: left; font-family: Calibri, Arial, sans-serif;">${descHtml}</td>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: center; font-family: Calibri, Arial, sans-serif;">${row.durationLabel || "-"}</td>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: center; font-family: Calibri, Arial, sans-serif;">${row.timeRange || "-"}</td>
          <td style="border: 1px solid #D9D9D9; padding: 5px 8px; text-align: center; font-family: Calibri, Arial, sans-serif;">${evacHtml || "-"}</td>
        </tr>`;
      })
      .join("\n");

    const htmlTable = `
      <table border="1" style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt;">
        <thead>
          <tr style="background-color: #D9E1F2; font-weight: bold; text-align: center;">
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Ride</th>
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Date</th>
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Incident Description / Cause</th>
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Duration</th>
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Time Range</th>
            <th style="border: 1px solid #8EA9DB; padding: 6px 10px;">Evacuation</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`;

    const plainText = allRows
      .map(row => {
        const desc = row.kind === "darkDay" ? "Dark Day." : row.description;
        const evac = row.evacuationLabel
          ? row.evacuationRange
            ? `${row.evacuationLabel} (${row.evacuationRange})`
            : row.evacuationLabel
          : "-";
        return `${row.rideCode}\t${row.dateLabel}\t${desc}\t${row.durationLabel || "-"}\t${row.timeRange || "-"}\t${evac}`;
      })
      .join("\n");

    const fullPlainText = `Ride\tDate\tIncident Description / Cause\tDuration\tTime Range\tEvacuation\n${plainText}`;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([htmlTable], { type: "text/html" });
        const blobText = new Blob([fullPlainText], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": blobHtml,
            "text/plain": blobText,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(fullPlainText);
      }
      setCopied(true);
      toast.success("Copied for Excel! Paste directly into your sheet with red text formatting preserved.");
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      toast.error("Could not write to clipboard. You can also select the table below and press Ctrl+C.");
    }
  };

  if (allRows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No incident logs found for the selected rides and dates.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/90 px-3.5 py-2 shadow-xs">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-slate-800">Excel Formatted Preview:</span>
          <span className="text-slate-500">{allRows.length} total entries</span>
        </div>
        <Button
          size="sm"
          onClick={handleCopyForExcel}
          className="h-8 gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied for Excel!" : "📋 Copy Formatted Table for Excel"}
        </Button>
      </div>

      {/* Excel Table Surface */}
      <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-xs">
        <table className="w-full border-collapse font-sans text-xs select-text">
          <thead>
            <tr className="border-b border-slate-300 bg-[#EBF1F5] text-[11px] font-bold text-slate-700">
              <th className="border-r border-slate-300 px-3 py-2 text-center w-16">Ride</th>
              <th className="border-r border-slate-300 px-3 py-2 text-center w-24">Date</th>
              <th className="border-r border-slate-300 px-3 py-2 text-left">Incident Description / Cause</th>
              <th className="border-r border-slate-300 px-3 py-2 text-center w-20">Duration</th>
              <th className="border-r border-slate-300 px-3 py-2 text-center w-28">Time Range</th>
              <th className="px-3 py-2 text-center w-44">Evacuation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {allRows.map((row, idx) => {
              const isWeather = row.kind === "weather";
              const isDarkDay = row.kind === "darkDay";
              return (
                <tr
                  key={row.id || idx}
                  className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                >
                  <td className="border-r border-slate-200 px-3 py-1.5 text-center font-mono-report font-bold text-slate-900">
                    {row.rideCode}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-1.5 text-center font-medium text-slate-700">
                    {row.dateLabel}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-1.5 text-left leading-relaxed">
                    {isDarkDay ? (
                      <span className="font-bold text-rose-600" style={{ color: "#DC2626" }}>
                        Dark Day.
                      </span>
                    ) : (
                      <>
                        <span className="font-bold text-rose-600" style={{ color: "#DC2626" }}>
                          {row.description}
                        </span>
                        {isWeather && (
                          <span className="ml-1.5 font-bold text-rose-600" style={{ color: "#DC2626" }}>
                            (Moderated)
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-1.5 text-center font-medium text-slate-600">
                    {row.durationLabel || "-"}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-1.5 text-center font-mono text-[11px] text-slate-500">
                    {row.timeRange || "-"}
                  </td>
                  <td className="px-3 py-1.5 text-center leading-relaxed">
                    {row.evacuationLabel ? (
                      <span className="font-bold text-rose-600" style={{ color: "#DC2626" }}>
                        {row.evacuationLabel}
                        {row.evacuationRange && (
                          <span className="ml-1 font-normal text-slate-500 font-mono text-[11px]">
                            ({row.evacuationRange})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 flex items-center justify-between">
        <span>Tip: Click "Copy Formatted Table for Excel" to paste directly with red text styling preserved, or select any cells above with mouse to copy.</span>
      </p>
    </div>
  );
}
