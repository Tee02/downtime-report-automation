import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, CloudSun, FileSpreadsheet, ScanText } from "lucide-react";

const weatherCodes = [
  ["10-13 Blue", "Clearing"],
  ["10-13 Green", "Light rain"],
  ["10-13 Orange", "Moderate to heavy rain"],
  ["10-13 Purple", "Fog"],
] as const;

export default function WeatherMappingGuide() {
  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900">
        <section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-emerald-100 px-6 py-8 shadow-sm sm:px-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="relative max-w-3xl"><Badge className="rounded-full bg-emerald-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-emerald-800">Paste-to-map reference</Badge><h1 className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-emerald-950 sm:text-4xl">Weather mapping</h1><p className="mt-3 text-sm leading-6 text-emerald-950/70">Paste WhatsApp weather updates into the Report Studio. The parser pairs each weather start with a corresponding ride-resume message, then adds completed intervals to the workbook in orange.</p></div>
        </section>

        <section className="mt-7 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6 sm:p-7"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><ScanText className="h-5 w-5" /></div><div><p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">How it works</p><h2 className="mt-2 text-xl font-extrabold tracking-tight">Start + resume are required</h2></div></div><div className="mt-6 space-y-4 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Start messages</strong> may contain a ride and a 11-3 weather code, such as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">VTM - 11-3: Inclement Weather ... @1515H</code>.</p><p><strong className="text-slate-900">Resume messages</strong> use 11-8 and close a matching ride interval, such as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">11-8: @1626H</code> for the most recent VTM start.</p><p>For grouped messages, each recognised ride code is paired independently. Operator initials such as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">FS</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">AH</code>, or <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">MD</code> are ignored.</p></div></CardContent></Card>
          <Card className="border-emerald-900 bg-[#153f3c] text-white shadow-sm"><CardContent className="p-6 sm:p-7"><div className="flex items-center gap-2 text-amber-200"><CloudSun className="h-4 w-4" /><p className="font-mono-report text-[11px] uppercase tracking-[0.16em]">Weather codes</p></div><h2 className="mt-3 text-xl font-extrabold tracking-tight">All weather intervals export in orange</h2><div className="mt-6 space-y-2">{weatherCodes.map(([code, meaning]) => <div key={code} className="flex items-center justify-between gap-3 rounded-xl bg-white/7 px-3 py-3"><span className="font-mono-report text-xs font-bold text-amber-100">{code}</span><span className="text-xs text-emerald-50/70">{meaning}</span></div>)}</div></CardContent></Card>
        </section>
        <Card className="mt-5 border-sky-100 bg-sky-50/65 shadow-sm"><CardContent className="flex gap-3 p-5 text-sm leading-6 text-slate-700"><FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p><strong className="text-slate-900">Report rule:</strong> mapped weather intervals are visual timeline annotations only. They do not add technical downtime minutes, change downtime percentages, or affect the weekly availability calculation. Starts without a recognised ride or matching resume message are safely ignored.</p></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
