import DashboardLayout from "@/components/DashboardLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle,
  ArrowDownUp,
  BookOpenCheck,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  Gauge,
  ImagePlus,
  Info,
  Layers3,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  Wrench,
  X,
} from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FaultCategory,
  FaultSeverity,
  filterWikiFaults,
  INITIAL_TROUBLE_FAULTS,
  TroubleFault,
  WIKI_CATEGORIES,
  WIKI_RIDES,
  WikiSort,
} from "@/data/troubleshootWiki";

const severityPresentation: Record<FaultSeverity, { icon: typeof ShieldAlert; className: string }> = {
  Critical: { icon: ShieldAlert, className: "border-rose-200 bg-rose-50 text-rose-700" },
  High: { icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-700" },
  Watch: { icon: CircleHelp, className: "border-yellow-200 bg-yellow-50 text-yellow-800" },
};

const blankDraft = {
  rideCode: "",
  title: "",
  faultCode: "",
  faultDate: new Date().toISOString().slice(0, 10),
  severity: "Watch" as FaultSeverity,
  category: "Mechanical" as FaultCategory,
  symptom: "",
  rootCause: "",
  correctiveAction: "",
  preventiveAction: "",
};

function ManualPreview({ label, imageUrl }: { label: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex max-h-48 items-center justify-center overflow-hidden bg-slate-900/5 p-2">
          <img src={imageUrl} alt={label} className="max-h-44 object-contain rounded" />
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700">
          <FileText className="h-3.5 w-3.5 text-indigo-500" /> {label}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex h-28 items-stretch bg-gradient-to-br from-slate-100 via-white to-slate-200">
        <div className="w-9 border-r border-slate-200 bg-slate-800 p-1.5">
          <div className="h-1.5 w-full rounded bg-slate-500" />
          <div className="mt-2 space-y-1">
            <div className="h-1 w-full rounded bg-slate-600" />
            <div className="h-1 w-3/4 rounded bg-slate-600" />
            <div className="h-1 w-full rounded bg-slate-600" />
          </div>
        </div>
        <div className="relative flex-1 p-3">
          <div className="h-2 w-20 rounded bg-slate-400" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <span className="h-9 rounded border border-slate-300 bg-white" />
            <span className="h-9 rounded border-2 border-rose-400 bg-rose-50" />
            <span className="h-9 rounded border border-slate-300 bg-white" />
          </div>
          <div className="mt-2 h-1.5 w-4/5 rounded bg-slate-300" />
          <div className="mt-1 h-1.5 w-3/5 rounded bg-slate-300" />
          <span className="absolute right-2 top-2 rounded bg-rose-600 px-1.5 py-0.5 text-[8px] font-bold text-white">CHECK</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-600">
        <FileText className="h-3.5 w-3.5 text-indigo-500" /> {label}
      </div>
    </div>
  );
}

function PhotoPreview({ label, imageUrl }: { label: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex max-h-48 items-center justify-center overflow-hidden bg-slate-900/5 p-2">
          <img src={imageUrl} alt={label} className="max-h-44 object-contain rounded" />
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700">
          <Camera className="h-3.5 w-3.5 text-emerald-600" /> {label}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-blue-100">
        <Camera className="h-8 w-8 text-slate-400" />
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-600">
        <Camera className="h-3.5 w-3.5 text-emerald-600" /> {label}
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: FaultSeverity }) {
  const config = severityPresentation[severity] || severityPresentation.Watch;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {severity}
    </span>
  );
}

function RideGlyph({ rideCode }: { rideCode: string }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black tracking-tight text-slate-600">
      {rideCode === "ALL" ? <Layers3 className="h-3.5 w-3.5" /> : rideCode}
    </span>
  );
}

export default function TroubleshootWiki() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [selectedRide, setSelectedRide] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState<FaultCategory | "All faults">("All faults");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WikiSort>("referenced");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<{ id: number; title: string } | null>(null);

  const rideScrollerRef = useRef<HTMLDivElement>(null);

  // Read persistent Faultpedia entries from database
  const { data: dbCards = [], isLoading: cardsLoading } = trpc.faultpedia.list.useQuery();

  const createCardMutation = trpc.faultpedia.create.useMutation({
    onSuccess: () => {
      utils.faultpedia.list.invalidate();
      setModalOpen(false);
      setDraft(blankDraft);
      setManualFile(null);
      setPhotoFile(null);
      toast.success("Faultpedia card created and saved to library.");
    },
    onError: err => {
      toast.error(err.message || "Failed to save card.");
    },
  });

  const deleteCardMutation = trpc.faultpedia.delete.useMutation({
    onSuccess: () => {
      utils.faultpedia.list.invalidate();
      setCardToDelete(null);
      toast.success("Faultpedia card removed.");
    },
    onError: err => {
      toast.error(err.message || "Failed to remove card.");
    },
  });

  // Combine DB records with initial reference fault knowledge
  const allFaults: TroubleFault[] = useMemo(() => {
    const fromDb: TroubleFault[] = dbCards.map(c => ({
      id: `db-${c.id}`,
      dbId: c.id,
      rideCode: c.rideCode,
      rideName: c.rideName,
      faultDate: c.faultDate,
      title: c.title,
      faultCode: c.faultCode,
      severity: (c.severity as FaultSeverity) || "Watch",
      category: (c.category as FaultCategory) || "Other",
      references: c.referenceCount,
      symptom: c.description,
      rootCause: c.rootCause,
      correctiveActions: c.correctiveAction.split(/\r?\n/).map(l => l.trim()).filter(Boolean),
      preventiveAction: c.preventiveAction,
      manualPages: c.manualScreenshotName || "Manual reference",
      manualScreenshotUrl: c.manualScreenshotUrl,
      supportPhotoName: c.supportPhotoName || "Supporting photo",
      supportPhotoUrl: c.supportPhotoUrl,
      isDbBacked: true,
    }));

    return [...fromDb, ...INITIAL_TROUBLE_FAULTS];
  }, [dbCards]);

  const displayedFaults = useMemo(
    () => filterWikiFaults(allFaults, selectedRide, selectedCategory, query, sort, startDate, endDate),
    [allFaults, selectedRide, selectedCategory, query, sort, startDate, endDate],
  );

  const visibleRideLabel = selectedRide === "ALL" ? "All rides" : selectedRide;
  const activeCards = allFaults.length;
  const coveredRides = new Set(allFaults.map(fault => fault.rideCode)).size;

  const scrollRides = (direction: number) => rideScrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  const updateDraft = (key: keyof typeof blankDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  const handleFile = (setter: (file: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.files?.[0] ?? null);
  };

  const uploadAsset = async (file: File): Promise<{ fileName: string; fileUrl: string }> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/downtime/summary-upload", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "File upload failed.");
    return { fileName: data.fileName, fileUrl: data.fileUrl };
  };

  const saveCard = async () => {
    if (!draft.rideCode || !draft.title.trim() || !draft.symptom.trim() || !draft.rootCause.trim()) {
      toast.error("Add a ride, fault title, symptom, and root cause before saving.");
      return;
    }
    const ride = WIKI_RIDES.find(item => item.code === draft.rideCode);
    setIsSubmitting(true);
    try {
      let manualScreenshotName: string | undefined;
      let manualScreenshotUrl: string | undefined;
      let supportPhotoName: string | undefined;
      let supportPhotoUrl: string | undefined;

      if (manualFile) {
        const uploaded = await uploadAsset(manualFile);
        manualScreenshotName = uploaded.fileName;
        manualScreenshotUrl = uploaded.fileUrl;
      }

      if (photoFile) {
        const uploaded = await uploadAsset(photoFile);
        supportPhotoName = uploaded.fileName;
        supportPhotoUrl = uploaded.fileUrl;
      }

      await createCardMutation.mutateAsync({
        rideCode: draft.rideCode,
        rideName: ride?.subtitle || draft.rideCode,
        faultDate: draft.faultDate || new Date().toISOString().slice(0, 10),
        title: draft.title.trim(),
        faultCode: draft.faultCode.trim() || "Reference",
        severity: draft.severity,
        category: draft.category,
        description: draft.symptom.trim(),
        rootCause: draft.rootCause.trim(),
        correctiveAction: draft.correctiveAction.trim() || "Review approved troubleshooting manual.",
        preventiveAction: draft.preventiveAction.trim() || "Planned inspection.",
        manualScreenshotName,
        manualScreenshotUrl,
        supportPhotoName,
        supportPhotoUrl,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload files and save.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
        <header className="flex flex-col justify-between gap-4 border-b border-[#9facd3]/55 pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b6aa4]">
              <BookOpenCheck className="h-3.5 w-3.5" /> Technical reference library
            </p>
            <h1 className="text-3xl font-black tracking-tight text-[#22305e] sm:text-4xl">Faultpedia</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              Centralized ride troubleshooting wiki with symptoms, root causes, corrective actions, and manual references.
            </p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="h-10 shrink-0 gap-2 bg-emerald-700 px-4 font-bold text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Create troubleshooting card
          </Button>
        </header>

        {/* Ride Navigator: All Fleet Rides */}
        <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-[#27345e]">Browse by ride ({WIKI_RIDES.length - 1} attractions)</h2>
            <span className="text-xs text-slate-500">Swipe or use arrows to explore</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scrollRides(-1)}
              aria-label="Scroll ride navigator left"
              className="h-9 w-9 shrink-0 border-slate-200 bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div
              ref={rideScrollerRef}
              className="flex flex-1 snap-x gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Browse faults by ride"
            >
              {WIKI_RIDES.map(ride => {
                const active = selectedRide === ride.code;
                return (
                  <button
                    key={ride.code}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedRide(ride.code)}
                    className={`min-w-[150px] snap-start rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      active
                        ? "border-emerald-300 bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RideGlyph rideCode={ride.code} />
                      <div className="min-w-0">
                        <p className={`text-xs font-extrabold ${active ? "text-emerald-800" : "text-slate-700"}`}>
                          {ride.label}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{ride.subtitle}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scrollRides(1)}
              aria-label="Scroll ride navigator right"
              className="h-9 w-9 shrink-0 border-slate-200 bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Filter Bar */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_278px]">
          <main className="space-y-4">
            <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Label htmlFor="fault-search" className="sr-only">
                      Search troubleshoot wiki
                    </Label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="fault-search"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Search fault title, symptom, code, or root cause"
                      className="h-10 border-slate-200 bg-slate-50 pl-9 shadow-none focus-visible:border-emerald-500"
                    />
                  </div>
                  <Select value={sort} onValueChange={value => setSort(value as WikiSort)}>
                    <SelectTrigger
                      aria-label="Sort troubleshoot cards"
                      className="h-10 w-full border-slate-200 bg-white text-xs font-bold text-slate-700 lg:w-[170px]"
                    >
                      <span className="flex items-center gap-2">
                        <ArrowDownUp className="h-3.5 w-3.5 text-slate-500" />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="referenced">Most referenced</SelectItem>
                      <SelectItem value="severity">Severity</SelectItem>
                      <SelectItem value="dateDesc">Newest fault date</SelectItem>
                      <SelectItem value="dateAsc">Oldest fault date</SelectItem>
                      <SelectItem value="alphabetical">A–Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-1.5" aria-label="Fault category filters">
                    {(["All faults", ...WIKI_CATEGORIES] as const).map(category => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                          selectedCategory === category
                            ? "bg-emerald-700 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-semibold">Incident date range:</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="h-7 w-32 text-[11px] bg-slate-50"
                      title="From date"
                    />
                    <span className="text-slate-400">–</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="h-7 w-32 text-[11px] bg-slate-50"
                      title="To date"
                    />
                    {(startDate || endDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                        }}
                        className="h-7 px-2 text-[10px] text-slate-500"
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Accordion Cards */}
            <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 shadow-[0_12px_30px_rgba(55,71,132,0.08)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-sm font-extrabold text-[#27345e]">Troubleshooting records · {visibleRideLabel}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Structured reference entries saved permanently in Faultpedia.</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {displayedFaults.length} record{displayedFaults.length === 1 ? "" : "s"}
                </span>
              </div>
              {cardsLoading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading Faultpedia library…
                </div>
              ) : displayedFaults.length ? (
                <Accordion type="single" collapsible className="divide-y divide-slate-200 px-2 sm:px-4">
                  {displayedFaults.map(fault => (
                    <FaultAccordion
                      key={String(fault.id)}
                      fault={fault}
                      canDelete={Boolean(user && fault.dbId)}
                      onDelete={() => fault.dbId && setCardToDelete({ id: fault.dbId, title: fault.title })}
                    />
                  ))}
                </Accordion>
              ) : (
                <div className="px-6 py-12 text-center">
                  <SlidersHorizontal className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-600">No matching fault cards</p>
                  <p className="mt-1 text-xs text-slate-500">Adjust the ride, category, or search filters.</p>
                </div>
              )}
            </section>
          </main>

          {/* Sidebar Quick Reference */}
          <aside className="h-fit rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] xl:sticky xl:top-5 space-y-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-extrabold text-[#27345e]">Knowledge status</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <MetricTile icon={FileText} value={String(activeCards)} label="Stored cards" tone="text-indigo-600 bg-indigo-50" />
              <MetricTile icon={Layers3} value={String(coveredRides)} label="Rides catalogued" tone="text-blue-600 bg-blue-50" />
              <MetricTile icon={Database} value={String(dbCards.length)} label="Database records" tone="text-emerald-700 bg-emerald-50" />
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/65 p-3 text-xs leading-relaxed text-indigo-800">
              <p className="font-bold">Maintenance note</p>
              <p className="mt-1 text-indigo-700">
                All saved cards persist into database tables and can be searched by ride code, symptoms, root causes, or incident dates.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={cardToDelete !== null} onOpenChange={open => !open && setCardToDelete(null)}>
        <DialogContent className="sm:max-w-[400px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900">Delete Faultpedia Card?</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              This will permanently delete "{cardToDelete?.title}" from the knowledge base. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setCardToDelete(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => cardToDelete && deleteCardMutation.mutate({ id: cardToDelete.id })}
              disabled={deleteCardMutation.isPending}
              className="bg-rose-700 text-white hover:bg-rose-800"
            >
              {deleteCardMutation.isPending ? "Deleting…" : "Delete card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Card Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-5xl"
          aria-describedby="troubleshoot-card-subtitle"
        >
          <DialogHeader className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-black text-[#24325e]">Create Faultpedia Card</DialogTitle>
                <DialogDescription id="troubleshoot-card-subtitle" className="mt-1 text-sm">
                  Document a technical downtime incident into a permanent, searchable troubleshooting reference.
                </DialogDescription>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close create troubleshooting card modal"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>
          <div className="grid gap-6 px-5 py-5 sm:px-7 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label htmlFor="wiki-ride">Ride</Label>
                <Select value={draft.rideCode} onValueChange={value => updateDraft("rideCode", value)}>
                  <SelectTrigger id="wiki-ride" className="mt-1.5 h-10 w-full">
                    <SelectValue placeholder="Select a ride" />
                  </SelectTrigger>
                  <SelectContent>
                    {WIKI_RIDES.filter(ride => ride.code !== "ALL").map(ride => (
                      <SelectItem key={ride.code} value={ride.code}>
                        {ride.code} · {ride.subtitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="wiki-date">Incident date</Label>
                  <Input
                    id="wiki-date"
                    type="date"
                    value={draft.faultDate}
                    onChange={event => updateDraft("faultDate", event.target.value)}
                    className="mt-1.5 h-10"
                  />
                </div>
                <div>
                  <Label htmlFor="wiki-code">Fault / alarm code</Label>
                  <Input
                    id="wiki-code"
                    value={draft.faultCode}
                    onChange={event => updateDraft("faultCode", event.target.value)}
                    placeholder="e.g. Alarms.Active.Estop"
                    className="mt-1.5 h-10"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="wiki-title">Fault title</Label>
                <Input
                  id="wiki-title"
                  value={draft.title}
                  onChange={event => updateDraft("title", event.target.value)}
                  placeholder="e.g. Lap bar 24V control voltage trip"
                  className="mt-1.5 h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Severity</Label>
                  <Select value={draft.severity} onValueChange={value => updateDraft("severity", value)}>
                    <SelectTrigger className="mt-1.5 h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Critical">Critical</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Watch">Watch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={draft.category} onValueChange={value => updateDraft("category", value)}>
                    <SelectTrigger className="mt-1.5 h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WIKI_CATEGORIES.map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="wiki-symptom">Symptom</Label>
                <Textarea
                  id="wiki-symptom"
                  value={draft.symptom}
                  onChange={event => updateDraft("symptom", event.target.value)}
                  placeholder="Describe the fault or symptom"
                  className="mt-1.5 min-h-24 resize-y"
                />
              </div>
              <div>
                <Label htmlFor="wiki-cause">Root cause</Label>
                <Textarea
                  id="wiki-cause"
                  value={draft.rootCause}
                  onChange={event => updateDraft("rootCause", event.target.value)}
                  placeholder="What is the verified or suspected root cause?"
                  className="mt-1.5 min-h-24 resize-y"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="wiki-corrective">Corrective action</Label>
                <Textarea
                  id="wiki-corrective"
                  value={draft.correctiveAction}
                  onChange={event => updateDraft("correctiveAction", event.target.value)}
                  placeholder={"1. Step one...\n2. Step two...\n3. Step three..."}
                  className="mt-1.5 min-h-28 resize-y"
                />
              </div>
              <div>
                <Label htmlFor="wiki-preventive">Preventive action</Label>
                <Textarea
                  id="wiki-preventive"
                  value={draft.preventiveAction}
                  onChange={event => updateDraft("preventiveAction", event.target.value)}
                  placeholder="What can be scheduled during weekly/monthly PM to prevent recurrence?"
                  className="mt-1.5 min-h-24 resize-y"
                />
              </div>
              <UploadZone
                label="Manual screenshot"
                helper="Attach relevant diagram or manual page"
                file={manualFile}
                onChange={handleFile(setManualFile)}
              />
              <UploadZone
                label="Supporting photos"
                helper="Upload incident photo or inspection photo"
                file={photoFile}
                onChange={handleFile(setPhotoFile)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="flex max-w-lg items-center gap-2 text-left text-xs text-slate-500">
              <Database className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              Cards are stored in the website database and available to all operators immediately.
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1 bg-white sm:flex-none">
                Cancel
              </Button>
              <Button
                onClick={saveCard}
                disabled={isSubmitting}
                className="flex-1 bg-emerald-700 text-white hover:bg-emerald-800 sm:flex-none gap-1.5"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Faultpedia Card
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function FaultAccordion({
  fault,
  canDelete,
  onDelete,
}: {
  fault: TroubleFault;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <AccordionItem value={String(fault.id)} className="border-0">
      <AccordionTrigger className="items-center rounded-xl px-3 py-4 no-underline hover:bg-slate-50 hover:no-underline [&>svg]:mr-1">
        <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <SeverityChip severity={fault.severity} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-extrabold leading-snug text-slate-800">{fault.title}</p>
              {fault.isDbBacked && (
                <Badge variant="outline" className="text-[9px] border-emerald-300 bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0">
                  Saved
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              Fault code · {fault.faultCode} <span className="mx-1 text-slate-300">•</span> {fault.rideCode} · {fault.rideName}{" "}
              <span className="mx-1 text-slate-300">•</span> {fault.faultDate}
            </p>
          </div>
          <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 sm:inline-flex">
            {fault.category}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-5">
        <div className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
          <DetailPanel label="Symptom" className="md:col-span-2">
            <p>{fault.symptom}</p>
          </DetailPanel>
          <DetailPanel label="Root cause" className="border-amber-200 bg-amber-50 text-amber-950">
            <p>{fault.rootCause}</p>
          </DetailPanel>
          <DetailPanel label="Preventive action" className="border-blue-200 bg-blue-50 text-blue-950">
            <p>{fault.preventiveAction}</p>
          </DetailPanel>
          <DetailPanel label="Corrective action" className="md:col-span-2">
            <ol className="list-decimal space-y-1.5 pl-4">
              {fault.correctiveActions.map((action, index) => (
                <li key={`${fault.id}-${index}`}>{action}</li>
              ))}
            </ol>
          </DetailPanel>
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Manual reference</p>
            <ManualPreview label={fault.manualPages} imageUrl={fault.manualScreenshotUrl} />
          </div>
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Supporting photos</p>
            <PhotoPreview label={fault.supportPhotoName} imageUrl={fault.supportPhotoUrl} />
          </div>
          {canDelete && onDelete && (
            <div className="md:col-span-2 flex justify-end pt-2 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete card
              </Button>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function DetailPanel({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700 ${className}`}>
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">{label}</p>
      {children}
    </div>
  );
}

function MetricTile({ icon: Icon, value, label, tone }: { icon: typeof FileText; value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 xl:flex xl:items-center xl:gap-3">
      <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg xl:mb-0 ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-lg font-black leading-none text-[#26345e]">{value}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function UploadZone({
  label,
  helper,
  file,
  onChange,
}: {
  label: string;
  helper: string;
  file: File | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = `upload-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="mt-1.5 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50"
      >
        <ImagePlus className="h-5 w-5 text-slate-400" />
        <span className="mt-1 text-xs font-bold text-slate-600">{helper}</span>
        <span className="mt-1 text-[10px] text-slate-500">PNG, JPG, WEBP up to 5 MB</span>
        <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onChange} />
      </label>
      {file && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
          <FileText className="h-4 w-4 text-indigo-600" />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{file.name}</span>
          <span className="shrink-0 text-slate-400">{Math.max(1, Math.round((file.size / 1024 / 1024) * 10) / 10)} MB</span>
        </div>
      )}
    </div>
  );
}
