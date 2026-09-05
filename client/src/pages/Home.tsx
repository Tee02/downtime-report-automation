import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Archive, ArrowRight, CheckCircle2, ChevronRight, CircleOff, CloudSun, Download, FileSpreadsheet, FileUp, Loader2, ShieldCheck, TriangleAlert, X } from "lucide-react";
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
  downtimePercentage: number;
  isClosed: boolean;
  isFireAlarm: boolean;
  isLateHandover: boolean;
  status: "matched" | "unmatched";
  matchNote: string;
};

type SummaryRide = { rideCode: string; attraction: string; minutes: number; events: number; evacuationMinutes: number; percentage: number; isClosed: boolean };
type ProcessingResponse = {
  records: ReviewRecord[];
  matchedCount: number;
  unmatchedCount: number;
  totalTechnicalMinutes: number;
  totalOperationsMinutes: number;
  totalEvacuationMinutes: number;
  totalEvacuationEvents: number;
  totalNetworkPercentage: number;
  closedRideCount: number;
  weatherIntervalCount?: number;
  fireAlarmCount?: number;
  summaryByRide: SummaryRide[];
  outputFileName: string;
  downloadUrl: string;
};

const HANDOVER_RIDES = [
  ["ACR", "Acorn Adventure"], ["BWZ", "Big Weld's Zeppelin"], ["BSC", "Blue Sky Carousel"], ["AFP", "Alpha Fighter Pilots"], ["ESD", "ESD: Global Defender"], ["EHF", "Epic Hummingbird Flyers"],
  ["VTM", "Epic Voyage to Moonhaven"], ["ETI", "Expedition Thin Ice"], ["IDD", "Independence Day: Defiance"], ["MFZ", "Mammoth Fun Zone"], ["BCT (EV)", "Boot Camp: Extreme Vert"],
  ["BCT (RC)", "Boot Camp: Ropes Course"], ["BCT (UZ)", "Boot Camp: Unharnessed Zones"], ["BCT (ZC)", "Boot Camp: Zip Coaster"], ["NATM", "Night At The Museum"], ["PTA", "Invasion of the Planet of the Apes"],
  ["RCC", "Rio Carnaval Chaos"], ["RTR", "Rivet Town Roller"], ["SAG", "Samba Gliders"], ["SRS", "Sid's Rock 'N' Slide"], ["TTC", "Terraform Tower Challenge"],
] as const;

function displayTime(value?: number) {
  if (value === undefined) return "—";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function severityForMinutes(minutes: number) {
  if (minutes >= 120) return { label: "Critical · 120+ min", color: "#D84A5D" };
  if (minutes >= 60) return { label: "High · 60–119 min", color: "#E67E36" };
  if (minutes >= 30) return { label: "Elevated · 30–59 min", color: "#3D52A0" };
  return { label: "Monitor · under 30 min", color: "#7091E6" };
}

function IncidentDescription({ record }: { record: ReviewRecord }) {
  if (!record.isLateHandover) return <p className="line-clamp-2">{record.description || "No description"}</p>;
  const fault = /\s*(\([^)]*\))\s*$/.exec(record.description);
  return <p className="line-clamp-2">{record.description.slice(0, fault?.index).trimEnd()}{fault ? <> <span className="font-bold text-red-600">{fault[1]}</span></> : null}</p>;
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
  return <button type="button" onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); accept(event.dataTransfer.files?.[0]); }} className="group relative min-h-44 w-full overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500 hover:bg-sky-50/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><input ref={inputRef} aria-label={label} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event: ChangeEvent<HTMLInputElement>) => accept(event.target.files?.[0])} /><div className="flex h-full flex-col justify-between gap-6"><div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-slate-950 p-2.5 text-white shadow-sm"><FileSpreadsheet className="h-5 w-5" /></div>{file ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ready</Badge> : <Badge variant="outline" className="border-slate-200 text-slate-500">XLSX</Badge>}</div><div><p className="text-sm font-extrabold tracking-tight text-slate-900">{file ? file.name : label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to replace` : note}</p></div></div></button>;
}

function RideChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SummaryRide }> }) {
  if (!active || !payload?.[0]?.payload) return null;
  const ride = payload[0].payload;
  const severity = severityForMinutes(ride.minutes);
  return <div className="rounded-xl border border-[#adbBda]/70 bg-[#f8f9ff] px-3 py-2.5 text-xs text-slate-700 shadow-lg"><p className="font-bold text-slate-900">{ride.attraction}</p><p className="mt-1 font-mono-report text-[#3d52a0]">{ride.rideCode}</p><div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-slate-600"><span>Technical time</span><strong className="text-right text-slate-900">{ride.minutes} min</strong><span>Downtime events</span><strong className="text-right text-slate-900">{ride.events}</strong><span>Severity</span><strong className="text-right" style={{ color: severity.color }}>{severity.label}</strong></div></div>;
}

export default function Home() {
  const [operationsFile, setOperationsFile] = useState<File>();
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState<ProcessingResponse>();
  const [error, setError] = useState<string>();
  const [handoverClosedRides, setHandoverClosedRides] = useState<string[]>([]);
  const [closureToAdd, setClosureToAdd] = useState<string>();
  const [saveToStorage, setSaveToStorage] = useState(false);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const [weatherText, setWeatherText] = useState("");
  const chartData = useMemo(() => response?.summaryByRide.slice(0, 10) ?? [], [response]);

  const buildReview = async () => {
    if (!operationsFile) {
      setError("Add the Operations downtime XLSX workbook before building the review.");
      return;
    }
    setProcessing(true);
    setError(undefined);
    setResponse(undefined);
    try {
      const formData = new FormData();
      formData.append("operationsFile", operationsFile);
      formData.append("closedRideCodes", JSON.stringify(handoverClosedRides));
      formData.append("saveToStorage", String(saveToStorage));
      if (weatherEnabled && weatherText.trim()) formData.append("weatherText", weatherText.trim());
      const result = await fetch("/api/downtime/analyze", { method: "POST", body: formData });
      const payload = await result.json() as ProcessingResponse & { error?: string };
      if (!result.ok) throw new Error(payload.error ?? "The workbook could not be processed.");
      setResponse(payload);
      toast.success("Review is ready. Confirm the records, then download the workbook.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The workbook could not be processed.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const addHandoverClosure = () => {
    if (!closureToAdd) return;
    setHandoverClosedRides(current => current.includes(closureToAdd) ? current : [...current, closureToAdd]);
    setClosureToAdd(undefined);
    setResponse(undefined);
  };
  const removeHandoverClosure = (rideCode: string) => { setHandoverClosedRides(current => current.filter(code => code !== rideCode)); setResponse(undefined); };

  return <DashboardLayout><div className="min-h-[calc(100vh-2rem)] text-slate-900"><section className="park-sky paper-grid relative overflow-hidden rounded-3xl border border-emerald-100 px-6 py-8 shadow-sm sm:px-9"><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" /><div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-amber-200/45 blur-3xl" /><div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><div className="mb-4 flex items-center gap-2"><Badge className="rounded-full bg-emerald-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-emerald-800">Park operations</Badge><span className="font-mono-report text-xs text-emerald-800/70">Technical 11-1 only</span></div><h1 className="text-3xl font-extrabold tracking-[-0.055em] text-emerald-950 sm:text-4xl">Downtime Report Studio</h1><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-950/70">Upload a daily Operations downtime log, add any confirmed handover closures or weather annotations, then generate a template-ready report for review.</p></div><div className="flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-xs leading-5 text-slate-600"><strong className="text-slate-900">Template-safe output.</strong> Only Technical 11-1 downtime contributes to availability. Weather maps in light yellow and 11-10 fire alarms map in green; neither changes downtime percentage.</p></div></div></section>

    <section className="mt-7"><Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="font-mono-report text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">01 · Configure report</p><h2 className="mt-2 text-xl font-extrabold tracking-tight">Build a clean report review</h2></div><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><FileUp className="h-5 w-5" /></div></div><div className="mt-6"><FileDropzone label="Operations downtime log" note="Drop any daily Operations downtime XLSX workbook here. Its date is placed in the cleared V2 template automatically." file={operationsFile} onFile={setOperationsFile} /></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-amber-100 bg-amber-50/55 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-800"><CircleOff className="h-4 w-4" /></div><div><p className="text-sm font-extrabold text-slate-900">Handover closure check <span className="ml-1 font-normal text-slate-500">(optional)</span></p><p className="mt-1 text-xs leading-5 text-slate-600">Optional — add a ride only when it did not hand over but is not marked CLOSED in the Operations log.</p></div></div><Badge variant="outline" className="h-fit border-amber-200 bg-white text-amber-800">{handoverClosedRides.length} selected</Badge></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Select value={closureToAdd} onValueChange={setClosureToAdd}><SelectTrigger className="h-11 flex-1 rounded-xl bg-white"><SelectValue placeholder="Select a closed ride" /></SelectTrigger><SelectContent>{HANDOVER_RIDES.filter(([code]) => !handoverClosedRides.includes(code)).map(([code, name]) => <SelectItem key={code} value={code}><span className="font-mono-report font-bold">{code}</span><span className="ml-2 text-slate-500">{name}</span></SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" onClick={addHandoverClosure} disabled={!closureToAdd} className="h-11 rounded-xl border-amber-200 bg-white px-4 font-bold text-amber-900 hover:bg-amber-100">Add ride</Button></div>{handoverClosedRides.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{handoverClosedRides.map(code => <button key={code} type="button" onClick={() => removeHandoverClosure(code)} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"><span className="font-mono-report">{code}</span><X className="h-3.5 w-3.5" /></button>)}</div>}</div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="rounded-xl bg-sky-100 p-2 text-sky-800"><CloudSun className="h-4 w-4" /></div><div><p className="text-sm font-extrabold text-slate-900">Add weather messages</p><p className="mt-1 text-xs leading-5 text-slate-600">Paste WhatsApp start and resume updates to draw confirmed weather intervals in the workbook.</p></div></div><Switch aria-label="Enable weather mapping" checked={weatherEnabled} onCheckedChange={setWeatherEnabled} /></div>{weatherEnabled && <div className="mt-4"><Textarea value={weatherText} onChange={event => setWeatherText(event.target.value)} placeholder="Paste weather messages here, including 11-3 starts and 11-8 resumes…" className="min-h-32 resize-y rounded-xl border-sky-200 bg-white text-sm leading-5 focus-visible:ring-sky-600" /><p className="mt-2 text-[11px] leading-5 text-sky-800">Only recognised ride codes with both a weather start and resume are mapped. Operator initials and incomplete intervals are ignored.</p></div>}</div></div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><Switch id="save-report" checked={saveToStorage} onCheckedChange={setSaveToStorage} className="mt-0.5" /><div><label htmlFor="save-report" className="cursor-pointer text-sm font-extrabold text-slate-900">Save this report to the website</label><p className="mt-1 text-xs leading-5 text-slate-600">Store the source downtime log and its generated workbook in the Saved reports library. Leave off for a one-time download.</p></div><Archive className="ml-auto h-5 w-5 shrink-0 text-emerald-700" /></div>
      {error && <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-2xl text-xs leading-5 text-slate-500">The tool selects <strong>Technical 11-1</strong> downtime only, excludes AVL, applies any handover closures and completed weather mappings, and writes availability only in the first weekly day column.</p><Button disabled={processing} onClick={buildReview} className="h-11 rounded-xl bg-emerald-800 px-5 font-bold text-white shadow-md transition-all duration-200 hover:bg-emerald-700 active:scale-[0.97]">{processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Building review</> : <>Build review <ArrowRight className="ml-2 h-4 w-4" /></>}</Button></div></CardContent></Card></section>

    {response && <section className="mt-7 space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[{ label: "Matched Technical 11-1", value: response.matchedCount, note: response.unmatchedCount ? `${response.unmatchedCount} need attention` : "AVL excluded", tone: "text-emerald-700 bg-emerald-50" }, { label: "Technical downtime", value: `${response.totalTechnicalMinutes} min`, note: "start → ride readiness", tone: "text-sky-700 bg-sky-50" }, { label: "Total downtime percentage", value: `${response.totalNetworkPercentage.toFixed(3)}%`, note: "total minutes ÷ minutes of 19 rides", tone: "text-amber-800 bg-amber-50" }, { label: "Evac of 11-7/11-17 (mins)", value: `${response.totalEvacuationMinutes} min`, note: "technical-event evacuation time", tone: "text-cyan-800 bg-cyan-50" }, { label: "Evacuation count", value: response.totalEvacuationEvents, note: "11-7 / 11-17 occurrences", tone: "text-indigo-800 bg-indigo-50" }, { label: "Visual mappings", value: (response.weatherIntervalCount ?? 0) + (response.fireAlarmCount ?? 0), note: `${response.weatherIntervalCount ?? 0} weather · ${response.fireAlarmCount ?? 0} fire alarm`, tone: "text-orange-800 bg-orange-50" }].map(stat => <Card key={stat.label} className="border-slate-200 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-bold text-slate-500">{stat.label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight">{stat.value}</p><span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${stat.tone}`}>{stat.note}</span></CardContent></Card>)}</div>
      <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]"><Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6"><div className="flex items-start justify-between"><div><p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-emerald-700">02 · Reporting view</p><h2 className="mt-2 text-lg font-extrabold tracking-tight">Technical downtime by ride</h2><p className="mt-1 text-xs text-slate-500">Bar colours flag incident severity by total downtime minutes per ride.</p></div><ChevronRight className="h-5 w-5 text-amber-500" /></div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">{[0, 30, 60, 120].map(minutes => { const severity = severityForMinutes(minutes); return <span key={minutes} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: severity.color }} />{severity.label}</span>; })}</div><div className="mt-5 h-72">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 2, left: 4 }}><CartesianGrid vertical={false} stroke="rgb(112 145 230 / 0.28)" /><XAxis dataKey="rideCode" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#596783" }} /><YAxis width={68} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#596783" }} tickFormatter={(value: number) => `${value} min`} /><Tooltip cursor={{ fill: "rgb(112 145 230 / 0.12)" }} content={<RideChartTooltip />} /><Bar dataKey="minutes" radius={[7, 7, 0, 0]}>{chartData.map(item => <Cell key={item.rideCode} fill={severityForMinutes(item.minutes).color} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No matched ride data available.</div>}</div></CardContent></Card>
      <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono-report text-[11px] uppercase tracking-[0.16em] text-emerald-700">03 · Pre-export review</p><h2 className="mt-2 text-lg font-extrabold tracking-tight">Technical records only</h2><p className="mt-1 text-xs text-slate-500">Before exporting, check the <strong>Match</strong> column to ensure every downtime item has been successfully mapped in the XLSX file.</p></div><Button asChild className="h-10 shrink-0 rounded-xl bg-emerald-800 font-bold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 active:scale-[0.97]"><a href={response.downloadUrl} download={response.outputFileName}><Download className="mr-2 h-4 w-4" />Download XLSX</a></Button></div><div className="mt-5 max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[820px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-3 py-3">Match</th><th className="px-3 py-3">Ride</th><th className="px-3 py-3">Incident</th><th className="px-3 py-3">Technical</th><th className="px-3 py-3">%</th><th className="px-3 py-3">Ops</th><th className="px-3 py-3">Evac</th></tr></thead><tbody className="divide-y divide-slate-100">{response.records.map(record => <tr key={`${record.sourceRow}-${record.rideCode ?? record.attraction}`} className="align-top"><td className="px-3 py-3">{record.status !== "matched" ? <span className="font-bold text-rose-700">Needs match</span> : record.isClosed ? <span className="inline-flex items-center gap-1 font-bold text-purple-800">Closed</span> : <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{record.rideCode}</span>}</td><td className="px-3 py-3 font-semibold text-slate-700">{record.attraction}<span className="mt-1 block font-mono-report text-[10px] font-normal text-slate-400">{record.dateLabel} · {record.sourceRow ? `Row ${record.sourceRow}` : "Handover selection"}</span></td><td className="max-w-56 px-3 py-3 leading-5 text-slate-600"><p className="line-clamp-2">{record.description || "No description"}</p>{record.status === "unmatched" && <p className="mt-1 text-[10px] text-rose-600">{record.matchNote}</p>}</td><td className={`px-3 py-3 whitespace-nowrap font-mono-report ${record.isClosed ? "text-purple-800" : "text-sky-800"}`}>{record.isClosed ? "10:00–18:00" : <>{displayTime(record.technicalStart)}–{displayTime(record.technicalEnd)}<span className="mt-1 block text-[10px] text-sky-600">{record.technicalMinutes} min</span></>}</td><td className={`px-3 py-3 whitespace-nowrap font-mono-report ${record.downtimePercentage >= 1 ? "font-bold text-red-600" : "text-amber-800"}`}>{record.isClosed ? "—" : `${record.downtimePercentage.toFixed(3)}%`}</td><td className="px-3 py-3 whitespace-nowrap font-mono-report text-pink-700">{record.isClosed || record.operationsEnd === undefined ? "—" : `${record.operationsMinutes} min`}</td><td className="px-3 py-3 whitespace-nowrap font-mono-report text-cyan-800">{record.isClosed || record.evacuationEnd === undefined ? "—" : `${record.evacuationMinutes} min`}</td></tr>)}</tbody></table></div></CardContent></Card></div></section>}
  </div></DashboardLayout>;
}
