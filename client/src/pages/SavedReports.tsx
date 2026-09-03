import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Archive, FileClock, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SavedReports() {
  const { data: reports, isLoading, error } = trpc.savedReports.list.useQuery();

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900">
        <section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-emerald-100 px-6 py-8 shadow-sm sm:px-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="relative max-w-2xl">
            <Badge className="rounded-full bg-emerald-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-emerald-800">Report library</Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-emerald-950 sm:text-4xl">Saved downtime reports</h1>
            <p className="mt-3 text-sm leading-6 text-emerald-950/70">Logs appear here only when <strong>Save to this website</strong> was selected during upload. This keeps routine one-off reports out of the retained library.</p>
          </div>
        </section>

        <Card className="mt-7 border-slate-200 bg-white shadow-sm"><CardContent className="p-6 sm:p-8">
          {isLoading ? <p className="text-sm text-slate-500">Loading saved reports…</p> : error ? <p className="text-sm text-rose-700">The report library could not be loaded. Please try again.</p> : reports?.length ? <div className="overflow-hidden rounded-2xl border border-slate-200"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Report date</th><th className="px-4 py-3">Source log</th><th className="px-4 py-3">Technical time</th><th className="px-4 py-3">Weather</th><th className="px-4 py-3">Downloads</th></tr></thead><tbody className="divide-y divide-slate-100">{reports.map(report => <tr key={report.id}><td className="px-4 py-4 font-mono-report font-bold text-slate-800">{report.reportDate}</td><td className="px-4 py-4 text-slate-600"><p className="max-w-52 truncate font-medium text-slate-800">{report.sourceFileName}</p><p className="mt-1 text-xs text-slate-400">Saved {new Date(report.createdAt).toLocaleString()}</p></td><td className="px-4 py-4 text-slate-600">{report.totalTechnicalMinutes} min<br /><span className="text-xs text-slate-400">{report.totalNetworkPercentage.toFixed(3)}%</span></td><td className="px-4 py-4 text-slate-600">{report.weatherIntervalCount} mapped</td><td className="px-4 py-4"><div className="flex gap-3 text-xs font-bold"><a className="text-emerald-800 hover:underline" href={report.sourceFileUrl} download>Source log</a><a className="text-emerald-800 hover:underline" href={report.outputFileUrl} download>Workbook</a></div></td></tr>)}</tbody></table></div> :
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Archive className="h-6 w-6" /></div>
            <div className="max-w-2xl">
              <p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">Retention on demand</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight">Your stored-log library is ready</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Saved source logs and their generated workbooks will be listed here with their report date, processing totals, weather mappings, and download links. Upload a report with storage enabled to create the first library entry.</p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-600"><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5"><FileClock className="h-3.5 w-3.5 text-slate-500" />Intentional saves only</span><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />Source log + generated workbook</span></div>
            </div>
          </div>}
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
