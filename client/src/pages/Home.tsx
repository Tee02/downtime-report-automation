import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, ArrowRight, CheckCircle2, Clock3, Download, FileUp, Loader2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ReviewRecord = {
  sourceRow: number;
  dateKey: string;
  dateLabel: string;
  attraction: string;
  rideCode?: string;
  department: string;
  description: string;
  technicalStart?: number;
  technicalEnd?: number;
  operationsEnd?: number;
  evacuationStart?: number;
  evacuationEnd?: number;
  technicalMinutes: number;
  operationsMinutes: number;
  evacuationMinutes: number;
  status: "matched" | "unmatched";
  matchNote: string;
};

type ProcessingResponse = {
  records: ReviewRecord[];
  matchedCount: number;
  unmatchedCount: number;
  totalTechnicalMinutes: number;
  totalOperationsMinutes: number;
  totalEvacuationMinutes: number;
  summaryByRide: Array<{ rideCode: string; attraction: string; minutes: number; events: number; evacuationMinutes: number }>;
  outputFileName: string;
  downloadUrl: string;
};

function displayTime(value?: number) {
  if (value === undefined) return "—";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function FileDropzone({ label, note, file, onFile }: { label: string; note: string; file?: File; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = (candidate?: File) => {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please choose an XLSX workbook.");
      return;
    }
    onFile(candidate);
  };
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={event => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        accept(event.dataTransfer.files?.[0]);
      }}
      className="group relative min-h-44 w-full overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500 hover:bg-sky-50/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
    >
      <input ref={inputRef} aria-label={label} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event: ChangeEvent<HTMLInputElement>) => accept(event.target.files?.[0])} />
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-slate-950 p-2.5 text-white shadow-sm"><FileSpreadsheet className="h-5 w-5" /></div>
          {file ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ready</Badge> : <Badge variant="outline" className="border-slate-200 text-slate-500">XLSX</Badge>}
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-slate-900">{file ? file.name : label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to replace` : note}</p>
        </div>
      </div>
    </button>
  );
}

/**
 * All content in this page are only for example, replace with your own feature implementation
 * When building pages, remember your instructions in Frontend Workflow, Frontend Best Practices, Design Guide and Common Pitfalls
 */
export default function Home() {
  const [operationsFile, setOperationsFile] = useState<File>();
  const [templateFile, setTemplateFile] = useState<File>();
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState<ProcessingResponse>();
  const [error, setError] = useState<string>();
  const chartData = useMemo(() => response?.summaryByRide.slice(0, 10) ?? [], [response]);

  const buildReview = async () => {
    if (!operationsFile || !templateFile) {
      setError("Add both XLSX workbooks before building the review.");
      return;
    }
    setProcessing(true);
    setError(undefined);
    setResponse(undefined);
    try {
      const formData = new FormData();
      formData.append("operationsFile", operationsFile);
      formData.append("templateFile", templateFile);
      const result = await fetch("/api/downtime/analyze", { method: "POST", body: formData });
      const payload = await result.json() as ProcessingResponse & { error?: string };
      if (!result.ok) throw new Error(payload.error ?? "The workbooks could not be processed.");
      setResponse(payload);
      toast.success("Review is ready. Confirm the records, then download the workbook.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The workbooks could not be processed.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-2rem)] text-slate-900">
        <section className="paper-grid relative overflow-hidden rounded-3xl border border-slate-200 bg-[#f5f7f6] px-6 py-8 shadow-sm sm:px-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-200/55 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-rose-100/70 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2"><Badge className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-slate-950">Technical reporting</Badge><span className="font-mono-report text-xs text-slate-500">11-1 workflow</span></div>
              <h1 className="text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Downtime Report Studio</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Turn Operations downtime into a reviewable, department-ready Technical workbook—without rebuilding the weekly sheet by hand.</p>
            </div>
            <div className="flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <p className="text-xs leading-5 text-slate-600"><strong className="text-slate-900">Template-safe output.</strong> The supplied Technical workbook layout stays intact; only matched 11-1 reporting values, labels, and timeline colors are updated.</p>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700">01 · Add source files</p><h2 className="mt-2 text-xl font-extrabold tracking-tight">Build a clean report review</h2></div><div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FileUp className="h-5 w-5" /></div></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2"><FileDropzone label="Operations downtime log" note="Drop the daily Operations downtime workbook here." file={operationsFile} onFile={setOperationsFile} /><FileDropzone label="Technical weekly template" note="Drop the weekly Technical Department template here." file={templateFile} onFile={setTemplateFile} /></div>
            {error && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Only <strong>11-1</strong> downtime records are selected. Review is created before download.</p><Button disabled={processing} onClick={buildReview} className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white shadow-md transition-all duration-200 hover:bg-slate-800 active:scale-[0.97]">{processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Building review</> : <>Build review <ArrowRight className="ml-2 h-4 w-4" /></>}</Button></div>
          </CardContent></Card>
          <Card className="border-slate-200 bg-slate-950 text-white shadow-sm"><CardContent className="p-6 sm:p-7"><div className="flex items-center gap-2 text-sky-300"><Sparkles className="h-4 w-4" /><p className="font-mono-report text-[11px] uppercase tracking-[0.16em]">Colour logic</p></div><h2 className="mt-3 text-xl font-extrabold tracking-tight">Made for quick checking</h2><p className="mt-2 text-sm leading-6 text-slate-300">Every selected record is placed by date and ride code, then marked across the minute-level Technical timeline.</p><div className="mt-6 space-y-3">{[{ color: "bg-[#b9dff0]", label: "Light blue", detail: "Technical downtime: start → ride readiness" }, { color: "bg-[#f7c9df]", label: "Pink", detail: "Operations recovery: readiness → formal uptime" }, { color: "bg-[#146c94]", label: "Dark blue", detail: "Evacuation interval; takes priority on overlaps" }].map(item => <div key={item.label} className="flex items-center gap-3 rounded-xl bg-white/7 p-3"><span className={`h-8 w-2 rounded-full ${item.color}`} /><div><p className="text-xs font-bold">{item.label}</p><p className="mt-0.5 text-[11px] text-slate-400">{item.detail}</p></div></div>)}</div></CardContent></Card>
        </section>

        {response && <section className="mt-7 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Matched 11-1 records", value: response.matchedCount, note: response.unmatchedCount ? `${response.unmatchedCount} need attention` : "Ready for export", tone: "text-emerald-700 bg-emerald-50" }, { label: "Technical downtime", value: `${response.totalTechnicalMinutes} min`, note: "start → ride readiness", tone: "text-sky-700 bg-sky-50" }, { label: "Operations recovery", value: `${response.totalOperationsMinutes} min`, note: "readiness → formal uptime", tone: "text-pink-700 bg-pink-50" }, { label: "Evacuation time", value: `${response.totalEvacuationMinutes} min`, note: "11-7 / 11-17 entries", tone: "text-cyan-800 bg-cyan-100" }].map(stat => <Card key={stat.label} className="border-slate-200 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-bold text-slate-500">{stat.label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight">{stat.value}</p><span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${stat.tone}`}>{stat.note}</span></CardContent></Card>)}</div>

          <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
            <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6"><div className="flex items-start justify-between"><div><p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-sky-700">02 · Reporting view</p><h2 className="mt-2 text-lg font-extrabold tracking-tight">Downtime by ride</h2></div><Clock3 className="h-5 w-5 text-slate-400" /></div><div className="mt-5 h-72">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 2, left: 4 }}><CartesianGrid horizontal={false} stroke="#e5e7eb" /><XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} unit=" min" /><YAxis type="category" dataKey="rideCode" width={42} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} /><Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(value: number) => [`${value} min`, "Technical downtime"]} labelFormatter={label => chartData.find(item => item.rideCode === label)?.attraction ?? label} /><Bar dataKey="minutes" radius={[0, 7, 7, 0]}>{chartData.map((item, index) => <Cell key={item.rideCode} fill={["#3c88b5", "#5c9fbd", "#7ab2c8", "#a0c9d7"][index % 4]} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No matched ride data available.</div>}</div></CardContent></Card>
            <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-sky-700">03 · Pre-export review</p><h2 className="mt-2 text-lg font-extrabold tracking-tight">Matched downtime records</h2><p className="mt-1 text-xs text-slate-500">Check the results before downloading the department workbook.</p></div><Button asChild className="h-10 shrink-0 rounded-xl bg-slate-950 font-bold text-white shadow-sm transition-all duration-200 hover:bg-slate-800 active:scale-[0.97]"><a href={response.downloadUrl} download={response.outputFileName}><Download className="mr-2 h-4 w-4" />Download XLSX</a></Button></div><div className="mt-5 max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-3 py-3">Match</th><th className="px-3 py-3">Ride</th><th className="px-3 py-3">Incident</th><th className="px-3 py-3">Technical</th><th className="px-3 py-3">Ops</th><th className="px-3 py-3">Evac</th></tr></thead><tbody className="divide-y divide-slate-100">{response.records.map(record => <tr key={record.sourceRow} className="align-top"><td className="px-3 py-3">{record.status === "matched" ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{record.rideCode}</span> : <span className="font-bold text-rose-700">Needs match</span>}</td><td className="px-3 py-3 font-semibold text-slate-700">{record.attraction}<span className="mt-1 block font-mono-report text-[10px] font-normal text-slate-400">{record.dateLabel} · Row {record.sourceRow}</span></td><td className="max-w-56 px-3 py-3 leading-5 text-slate-600"><p className="line-clamp-2">{record.description || "No description"}</p>{record.status === "unmatched" && <p className="mt-1 text-[10px] text-rose-600">{record.matchNote}</p>}</td><td className="px-3 py-3 whitespace-nowrap font-mono-report text-sky-800">{displayTime(record.technicalStart)}–{displayTime(record.technicalEnd)}<span className="mt-1 block text-[10px] text-sky-600">{record.technicalMinutes} min</span></td><td className="px-3 py-3 whitespace-nowrap font-mono-report text-pink-700">{record.operationsEnd === undefined ? "—" : `${record.operationsMinutes} min`}</td><td className="px-3 py-3 whitespace-nowrap font-mono-report text-cyan-800">{record.evacuationEnd === undefined ? "—" : `${record.evacuationMinutes} min`}</td></tr>)}</tbody></table></div></CardContent></Card>
          </div>
        </section>}
      </div>
    </DashboardLayout>
  );
}
