import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditableText } from "@/contexts/TextEditContext";
import type { SavedDowntimeReport } from "../../../drizzle/schema";

interface CompactSavedReportLibraryProps {
  reports: SavedDowntimeReport[];
  selectedDateKeys: Set<string>;
  onToggleDate: (reportDate: string) => void;
  onDeleteReport: (id: number) => void;
  canDelete: boolean;
}

function displayDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function CompactSavedReportLibrary({
  reports,
  selectedDateKeys,
  onToggleDate,
  onDeleteReport,
  canDelete,
}: CompactSavedReportLibraryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <EditableText
              contentKey="saved_library_step"
              defaultText="Saved report library"
              as="p"
              className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-[#3D52A0] block"
            />
            <EditableText
              contentKey="saved_library_title"
              defaultText="Included source logs"
              as="h2"
              className="mt-0.5 text-base font-extrabold tracking-tight text-slate-900 block"
            />
          </div>
          <Badge
            variant="outline"
            className="border-[#8697c4]/60 bg-white/70 text-[#3D52A0] text-[11px] font-bold shrink-0"
          >
            {reports.length} report{reports.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <EditableText
          contentKey="saved_library_desc"
          defaultText="Select reports to include in the analytics. (Display and recall only)"
          as="p"
          className="mt-1 text-[11px] text-slate-500 block"
        />

        {/* Table container: scrollbar is HIDDEN when collapsed, scrollable when expanded */}
        <div
          className={`mt-2.5 rounded-xl border border-[#adbBda]/65 bg-white transition-all ${
            isExpanded
              ? "max-h-[340px] overflow-y-auto"
              : "max-h-[148px] overflow-hidden"
          }`}
        >
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#ede8f5] uppercase tracking-[0.08em] text-slate-500 text-[10px]">
              <tr>
                <th className="px-2.5 py-2 w-8"><EditableText contentKey="th_inc" defaultText="Inc" /></th>
                <th className="px-2.5 py-2"><EditableText contentKey="th_date" defaultText="Date" /></th>
                <th className="px-2.5 py-2"><EditableText contentKey="th_source" defaultText="Source file" /></th>
                <th className="px-2.5 py-2 text-right"><EditableText contentKey="th_downtime" defaultText="Downtime" /></th>
                <th className="px-2.5 py-2 text-center w-12"><EditableText contentKey="th_del" defaultText="Del" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#adbBda]/30">
              {reports.map(report => {
                const isSelected = selectedDateKeys.has(report.reportDate);
                return (
                  <tr
                    key={report.id}
                    className={isSelected ? "bg-indigo-50/70" : "hover:bg-slate-50"}
                  >
                    <td className="px-2.5 py-2">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onToggleDate(report.reportDate)}
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          isSelected
                            ? "border-[#3D52A0] bg-[#3D52A0] text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </td>
                    <td className="px-2.5 py-2 font-mono-report font-bold text-slate-800 text-[11px] whitespace-nowrap">
                      {displayDate(report.reportDate)}
                    </td>
                    <td className="px-2.5 py-2 max-w-[140px]">
                      <span className="block truncate font-semibold text-slate-800 text-[11px]" title={report.sourceFileName}>
                        {report.sourceFileName}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-700 text-[11px] whitespace-nowrap font-mono">
                      {report.totalTechnicalMinutes}m
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <button
                        type="button"
                        disabled={!canDelete}
                        title={!canDelete ? "Sign in to delete" : "Delete report"}
                        onClick={() => onDeleteReport(report.id)}
                        className="text-rose-600 hover:text-rose-800 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View more toggle button at the bottom */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 w-full text-[11px] font-bold text-[#3D52A0] hover:bg-indigo-50/70 flex items-center justify-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/40"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <EditableText contentKey="saved_btn_show_less" defaultText="Show less (collapse view)" />
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <EditableText contentKey="saved_btn_view_more" defaultText={`View more (${reports.length} reports)`} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
