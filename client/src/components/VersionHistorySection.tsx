import React, { useState } from "react";
import { CURRENT_VERSION, VERSION_HISTORY, type VersionRecord } from "@/data/versionHistory";
import { GitCommit, ChevronDown, ChevronUp, History, Sparkles, X, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VersionHistorySectionProps {
  isCollapsed?: boolean;
}

export function VersionHistorySection({ isCollapsed = false }: VersionHistorySectionProps) {
  const [isExpandedInline, setIsExpandedInline] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-2 border-t border-[#adbBda]/50">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          title={`Version ${CURRENT_VERSION} - Click to view changelog`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-[#3D52A0] shadow-sm hover:bg-white hover:text-[#293252] transition-colors border border-[#8697c4]/50"
        >
          <History className="h-4 w-4" />
        </button>
        <span className="mt-1 text-[9px] font-mono font-bold text-slate-500">
          {CURRENT_VERSION}
        </span>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-[#fbfbff] border-[#adbBda]/80 shadow-2xl">
            <DialogHeader className="p-5 pb-3 border-b border-[#adbBda]/40 bg-[#ede8f5]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#3D52A0] text-white">
                    <History className="h-4 w-4" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-extrabold text-[#293252]">
                      Release & Job History
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      All versions and completed enhancement jobs for this website
                    </DialogDescription>
                  </div>
                </div>
                <Badge className="bg-[#3D52A0] text-white font-mono text-xs">
                  Current: {CURRENT_VERSION}
                </Badge>
              </div>
            </DialogHeader>
            <div className="p-5 overflow-y-auto space-y-4 divide-y divide-slate-200">
              {VERSION_HISTORY.map(ver => (
                <VersionCard key={ver.version} record={ver} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-[#adbBda]/50 text-slate-800">
      {/* Version button at bottom of side panel */}
      <button
        type="button"
        onClick={() => setIsExpandedInline(!isExpandedInline)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/60 hover:bg-white/90 border border-[#8697c4]/40 transition-all text-left shadow-xs group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#3D52A0]/10 text-[#3D52A0] group-hover:bg-[#3D52A0] group-hover:text-white transition-colors">
            <History className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-extrabold text-[#293252]">
                {CURRENT_VERSION}
              </span>
              <span className="inline-block px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                Live
              </span>
            </div>
            <span className="block truncate text-[10px] text-slate-500">
              Click to view previous jobs
            </span>
          </div>
        </div>
        <span className="text-slate-400 group-hover:text-slate-700 transition-colors">
          {isExpandedInline ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expandable scrollable section in the side panel */}
      {isExpandedInline && (
        <div className="mt-2 rounded-xl border border-[#adbBda]/70 bg-white/80 p-2.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-[11px] font-extrabold text-[#293252] flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-[#3D52A0]" />
              Previous Jobs Done
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpandedInline(false)}
              className="h-5 w-5 p-0 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-2 max-h-[320px] overflow-y-auto pr-1 space-y-3.5 text-xs divide-y divide-slate-100">
            {VERSION_HISTORY.map(ver => (
              <div key={ver.version} className="pt-2 first:pt-0">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-[#3D52A0]">
                      {ver.version}
                    </span>
                    {ver.isCurrent && (
                      <span className="rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-[#3D52A0]">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-slate-400">
                    #{ver.commit}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-2.5 w-2.5" />
                    {ver.date}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {ver.time}
                  </span>
                </div>

                <p className="mt-1 font-semibold text-[11px] text-slate-800 leading-tight">
                  {ver.title}
                </p>

                <ul className="mt-1 space-y-0.5 pl-3 list-disc text-[10px] text-slate-600 leading-normal">
                  {ver.tasks.map((task, idx) => (
                    <li key={idx} className="marker:text-[#3D52A0]">
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionCard({ record }: { record: VersionRecord }) {
  return (
    <div className="pt-3 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-extrabold text-sm text-[#3D52A0]">
              {record.version}
            </span>
            {record.isCurrent && (
              <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-[#3D52A0] text-[10px] font-bold">
                Current Live Version
              </Badge>
            )}
            <span className="font-mono text-xs text-slate-400">
              commit #{record.commit}
            </span>
          </div>
          <h4 className="mt-1 text-xs font-bold text-slate-900">
            {record.title}
          </h4>
        </div>
        <div className="text-right text-[11px] text-slate-500 font-mono">
          <div>{record.date}</div>
          <div className="text-[10px] text-slate-400">{record.time}</div>
        </div>
      </div>

      <div className="mt-2 pl-4 border-l-2 border-indigo-200 space-y-1">
        {record.tasks.map((task, idx) => (
          <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-600 leading-relaxed">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#3D52A0] shrink-0 mt-0.5" />
            <span>{task}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
