import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowDownUp,
  BookOpenCheck,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Gauge,
  ImagePlus,
  Layers3,
  LayoutList,
  LockKeyhole,
  PanelsTopLeft,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import React, { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FaultCategory,
  filterWikiFaults,
  TroubleFault,
  WIKI_CATEGORIES,
  WIKI_RIDES,
  WikiSort,
} from "@/data/troubleshootWiki";
import { trpc } from "@/lib/trpc";

type UploadedFileState = {
  name: string;
  url: string;
  size?: number;
};

const blankDraft = {
  rideCode: "",
  title: "",
  category: "Mechanical" as FaultCategory,
  symptom: "",
  rootCause: "",
  correctiveAction: "",
  preventiveAction: "",
};

function RideGlyph({ rideCode }: { rideCode: string }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black tracking-tight text-slate-600">
      {rideCode === "ALL" ? <Layers3 className="h-3.5 w-3.5" /> : rideCode}
    </span>
  );
}

export default function TroubleshootWiki() {
  const [selectedRide, setSelectedRide] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState<FaultCategory | "All faults">("All faults");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WikiSort>("referenced");

  // Create card modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [manualUpload, setManualUpload] = useState<UploadedFileState | null>(null);
  const [photoUpload, setPhotoUpload] = useState<UploadedFileState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingFault, setEditingFault] = useState<TroubleFault | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");

  // Detail Pop-Up Dialog
  const [activeFault, setActiveFault] = useState<TroubleFault | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [faultToDelete, setFaultToDelete] = useState<TroubleFault | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);

  const rideScrollerRef = useRef<HTMLDivElement>(null);

  // DB queries and mutations
  const trpcUtils = trpc.useUtils();
  const { data: dbCards, isLoading } = trpc.faultpedia.list.useQuery();
  const clearCardEditor = () => {
    setCreateModalOpen(false);
    setEditingFault(null);
    setDraft(blankDraft);
    setManualUpload(null);
    setPhotoUpload(null);
  };

  const createMutation = trpc.faultpedia.create.useMutation({
    onSuccess: async () => {
      await trpcUtils.faultpedia.list.invalidate();
      toast.success("Faultpedia card saved to the website system.");
      clearCardEditor();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save card.");
    },
  });

  const updateMutation = trpc.faultpedia.update.useMutation({
    onSuccess: async () => {
      await trpcUtils.faultpedia.list.invalidate();
      toast.success("Faultpedia card updated.");
      clearCardEditor();
    },
    onError: (err) => toast.error(err.message || "Failed to update this card."),
  });

  const deleteMutation = trpc.faultpedia.delete.useMutation({
    onSuccess: async () => {
      await trpcUtils.faultpedia.list.invalidate();
      setFaultToDelete(null);
      setDeleteStep(1);
      toast.success("Faultpedia card deleted.");
    },
    onError: (err) => toast.error(err.message || "Unable to delete this card."),
  });

  const requestFaultDeletion = (fault: TroubleFault) => {
    if (!fault.dbId) return;
    setFaultToDelete(fault);
    setDeleteStep(1);
  };

  // Combine DB cards with initial reference cards if none exist in DB
  const allFaults: TroubleFault[] = useMemo(() => {
    const savedCards = (dbCards || []).map((c) => {
        const parsedActions = c.correctiveAction
          ? c.correctiveAction
              .split(/\r?\n|(?=\d+\.\s)/)
              .map((item) => item.replace(/^\d+\.\s*/, "").trim())
              .filter(Boolean)
          : [];
        return {
          id: `db-${c.id}`,
          dbId: c.id,
          rideCode: c.rideCode,
          rideName: c.rideName,
          faultDate: c.faultDate,
          title: c.title,
          faultCode: c.faultCode || "Reference",
          category: (c.category as FaultCategory) || "Other",
          references: c.referenceCount || 0,
          symptom: c.description,
          rootCause: c.rootCause,
          correctiveActions: parsedActions.length ? parsedActions : [c.correctiveAction],
          preventiveAction: c.preventiveAction,
          manualScreenshotName: c.manualScreenshotName,
          manualScreenshotUrl: c.manualScreenshotUrl,
          supportPhotoName: c.supportPhotoName,
          supportPhotoUrl: c.supportPhotoUrl,
          createdAt: c.createdAt,
        };
      });

    // Faultpedia is an operator-owned library. Seed examples are intentionally
    // excluded so the list only contains records entered by the team.
    return savedCards;
  }, [dbCards]);

  const displayedFaults = useMemo(
    () => filterWikiFaults(allFaults, selectedRide, selectedCategory, query, sort),
    [allFaults, selectedRide, selectedCategory, query, sort]
  );

  const visibleRideLabel = selectedRide === "ALL" ? "All rides" : selectedRide;
  const activeCards = allFaults.length;
  const coveredRides = new Set(allFaults.map((fault) => fault.rideCode)).size;

  const scrollRides = (direction: number) =>
    rideScrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  const updateDraft = (key: keyof typeof blankDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Auto-numbering handler for textareas (Corrective Action & Preventive Action)
  const handleAutoNumberKeyDown = (
    field: "correctiveAction" | "preventiveAction",
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      const textarea = event.currentTarget;
      const cursor = textarea.selectionStart;
      const text = textarea.value;
      const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
      const currentLine = text.substring(lineStart, cursor);
      const match = currentLine.match(/^(\d+)\.\s*(.*)$/);

      if (match) {
        event.preventDefault();
        const currentNumber = parseInt(match[1], 10);
        const nextNumber = currentNumber + 1;
        const insertText = `\n${nextNumber}. `;
        const newText = text.substring(0, cursor) + insertText + text.substring(cursor);

        updateDraft(field, newText);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = cursor + insertText.length;
        }, 0);
      }
    }
  };

  // Upload file helper via /api/downtime/summary-upload
  const uploadAttachment = async (file: File): Promise<UploadedFileState> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/downtime/summary-upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to upload image.");
    }
    const data = await res.json();
    return {
      name: file.name,
      url: data.fileUrl,
      size: file.size,
    };
  };

  const handleFileUpload = async (
    file: File,
    setter: (state: UploadedFileState | null) => void
  ) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a PNG, JPG, or WEBP image file.");
      return;
    }
    try {
      setIsUploading(true);
      const uploaded = await uploadAttachment(file);
      setter(uploaded);
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const saveCard = () => {
    if (!draft.rideCode || !draft.title.trim() || !draft.symptom.trim() || !draft.rootCause.trim()) {
      toast.error("Add a ride, fault title, symptom, and root cause before saving.");
      return;
    }
    const ride = WIKI_RIDES.find((item) => item.code === draft.rideCode);
    const payload = {
      rideCode: draft.rideCode,
      rideName: ride?.subtitle || draft.rideCode,
      title: draft.title.trim(),
      faultCode: editingFault?.faultCode || "Reference",
      category: draft.category,
      description: draft.symptom.trim(),
      rootCause: draft.rootCause.trim(),
      correctiveAction: draft.correctiveAction.trim() || "Review the incident and complete approved troubleshooting steps.",
      preventiveAction: draft.preventiveAction.trim() || "Add a planned preventive action.",
      manualScreenshotName: manualUpload ? manualUpload.name : null,
      manualScreenshotUrl: manualUpload ? manualUpload.url : null,
      supportPhotoName: photoUpload ? photoUpload.name : null,
      supportPhotoUrl: photoUpload ? photoUpload.url : null,
    };

    if (editingFault?.dbId) {
      updateMutation.mutate({ id: editingFault.dbId, ...payload });
    } else {
      createMutation.mutate({ ...payload, severity: "Watch", referenceCount: 0 });
    }
  };

  const openFaultEditor = (fault: TroubleFault) => {
    if (!fault.dbId) return;
    setEditingFault(fault);
    setDraft({
      rideCode: fault.rideCode,
      title: fault.title,
      category: fault.category,
      symptom: fault.symptom,
      rootCause: fault.rootCause,
      correctiveAction: fault.correctiveActions.map((action, index) => `${index + 1}. ${action}`).join("\n"),
      preventiveAction: fault.preventiveAction,
    });
    setManualUpload(fault.manualScreenshotUrl ? { name: fault.manualScreenshotName || "Manual screenshot", url: fault.manualScreenshotUrl } : null);
    setPhotoUpload(fault.supportPhotoUrl ? { name: fault.supportPhotoName || "Supporting photo", url: fault.supportPhotoUrl } : null);
    setDetailModalOpen(false);
    setCreateModalOpen(true);
  };

  const openFaultDetail = (fault: TroubleFault) => {
    setActiveFault(fault);
    setDetailModalOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
        <header className="flex flex-col justify-between gap-4 border-b border-[#9facd3]/55 pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b6aa4]">
              <BookOpenCheck className="h-3.5 w-3.5" /> Technical reference library
            </p>
            <h1 className="text-3xl font-black tracking-tight text-[#22305e] sm:text-4xl">
              Faultpedia
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              Find common ride faults, root causes, corrective actions, preventive actions, and manual references across all attractions.
            </p>
          </div>
          <Button
            onClick={() => { setEditingFault(null); setDraft(blankDraft); setManualUpload(null); setPhotoUpload(null); setCreateModalOpen(true); }}
            className="h-10 shrink-0 gap-2 bg-emerald-700 px-4 font-bold text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            {editingFault ? "Edit troubleshooting card" : "Create troubleshooting card"}
          </Button>
        </header>

        {/* Ride Navigator: All 21 rides */}
        <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-[#27345e]">Browse by ride</h2>
            <span className="text-xs text-slate-500">Swipe or use arrows to explore all 21 attractions</span>
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
              {WIKI_RIDES.map((ride) => {
                const active = selectedRide === ride.code;
                return (
                  <button
                    key={ride.code}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedRide(ride.code)}
                    className={`min-w-[160px] snap-start rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      active
                        ? "border-emerald-400 bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RideGlyph rideCode={ride.code} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-extrabold ${active ? "text-emerald-800" : "text-slate-700"}`}>
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

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_278px]">
          <main className="space-y-4">
            {/* Filter Bar: search, limited 3 categories, sort */}
            <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Label htmlFor="fault-search" className="sr-only">
                    Search Faultpedia
                  </Label>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="fault-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search fault code, title, symptom, or keyword"
                    className="h-10 border-slate-200 bg-slate-50 pl-9 shadow-none focus-visible:border-emerald-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Fault category filters">
                  {(["All faults", ...WIKI_CATEGORIES] as const).map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-full px-3 py-2 text-xs font-bold transition-colors ${
                        selectedCategory === category
                          ? "bg-emerald-700 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <Select value={sort} onValueChange={(value) => setSort(value as WikiSort)}>
                  <SelectTrigger
                    aria-label="Sort fault cards"
                    className="h-10 w-full border-slate-200 bg-white text-xs font-bold text-slate-700 lg:w-[165px]"
                  >
                    <span className="flex items-center gap-2">
                      <ArrowDownUp className="h-3.5 w-3.5 text-slate-500" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referenced">Most referenced</SelectItem>
                    <SelectItem value="recent">Newest saved</SelectItem>
                    <SelectItem value="alphabetical">A–Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Fault Cards Listing: Click opens Window Pop-Up, NO severity tag */}
            <section className="rounded-2xl border border-[#b3bfdc]/65 bg-white/95 shadow-[0_12px_30px_rgba(55,71,132,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 px-5 py-4">
                <div>
                  <p className="text-sm font-extrabold text-[#27345e]">
                    Fault cards · {visibleRideLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Click a saved fault to review or edit its troubleshooting details.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {displayedFaults.length} card{displayedFaults.length === 1 ? "" : "s"}
                  </span>
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Faultpedia view mode">
                    <button type="button" onClick={() => setViewMode("list")} aria-label="List view" className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}><LayoutList className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setViewMode("cards")} aria-label="Large card view" className={`rounded-md p-1.5 ${viewMode === "cards" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}><PanelsTopLeft className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="py-16 text-center text-xs font-bold text-slate-400">
                  Loading Faultpedia records...
                </div>
              ) : displayedFaults.length ? (
                <div className={viewMode === "cards" ? "grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3" : "divide-y divide-slate-300 p-2 sm:p-4"}>
                  {displayedFaults.map((fault) => (
                    <div
                      key={fault.id}
                      className={`group flex gap-1 rounded-xl border border-transparent transition hover:border-emerald-200 hover:bg-emerald-50/30 focus-within:ring-2 focus-within:ring-emerald-500 ${viewMode === "cards" ? "min-h-[180px] flex-col bg-slate-50/65 p-1" : "items-center"}`}
                    >
                      <button
                        onClick={() => openFaultDetail(fault)}
                        className={`flex min-w-0 flex-1 gap-3 rounded-xl p-3.5 text-left transition focus:outline-none ${viewMode === "cards" ? "flex-col justify-between" : "items-center justify-between"}`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <RideGlyph rideCode={fault.rideCode} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-slate-800 group-hover:text-emerald-800">{fault.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500">Fault code · <span className="font-mono font-semibold text-slate-700">{fault.faultCode}</span></p>
                            {viewMode === "cards" && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{fault.symptom}</p>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{fault.category}</span>
                          {(fault.supportPhotoUrl || fault.manualScreenshotUrl) && <span title="Has photo attachment" className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Camera className="h-3.5 w-3.5" /></span>}
                          <ChevronRight className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                        </div>
                      </button>
                      {fault.dbId && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => requestFaultDeletion(fault)} aria-label={`Delete ${fault.title}`} title="Delete saved card" className={`h-9 w-9 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700 ${viewMode === "cards" ? "mb-2 mr-2 self-end" : "mr-2"}`}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <SlidersHorizontal className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-600">No matching fault cards</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Adjust the ride, category, or search term, or create a new card.
                  </p>
                </div>
              )}
            </section>
          </main>

          {/* Quick reference sidebar */}
          <aside className="h-fit rounded-2xl border border-[#b3bfdc]/65 bg-white/95 p-4 shadow-[0_12px_30px_rgba(55,71,132,0.08)] xl:sticky xl:top-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-extrabold text-[#27345e]">Quick reference</h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <MetricTile
                icon={FileText}
                value={String(activeCards)}
                label="Active cards"
                tone="text-indigo-600 bg-indigo-50"
              />
              <MetricTile
                icon={Layers3}
                value={String(coveredRides)}
                label="Rides covered"
                tone="text-blue-600 bg-blue-50"
              />
              <MetricTile
                icon={Wrench}
                value={String(allFaults.filter((f) => !!f.dbId).length)}
                label="Saved records"
                tone="text-emerald-700 bg-emerald-50"
              />
            </div>
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/65 p-3 text-xs leading-relaxed text-indigo-800">
              <p className="font-bold">Operational note</p>
              <p className="mt-1 text-indigo-700">
                Use approved ride procedures and safety requirements before applying any reference action.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* DETAIL WINDOW POP-UP DIALOG */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-4xl"
          aria-describedby="fault-detail-subtitle"
        >
          {activeFault && (
            <div>
              <DialogHeader className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RideGlyph rideCode={activeFault.rideCode} />
                      <span className="font-mono text-xs font-extrabold text-slate-700">
                        {activeFault.rideCode} · {activeFault.rideName}
                      </span>
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        {activeFault.category}
                      </span>
                    </div>
                    <DialogTitle className="mt-2 text-xl font-black text-[#24325e]">
                      {activeFault.title}
                    </DialogTitle>
                    <DialogDescription id="fault-detail-subtitle" className="mt-0.5 text-xs text-slate-500">
                      Fault code: <span className="font-mono font-semibold text-slate-700">{activeFault.faultCode}</span>
                    </DialogDescription>
                  </div>
                  <button
                    onClick={() => setDetailModalOpen(false)}
                    aria-label="Close fault window"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </DialogHeader>

              <div className="space-y-4 px-6 py-5">
                <DetailPanel label="Symptom">
                  <p className="text-sm text-slate-800">{activeFault.symptom}</p>
                </DetailPanel>

                <div className="grid gap-4 md:grid-cols-2">
                  <DetailPanel label="Root cause" className="border-amber-200 bg-amber-50/60 text-amber-950">
                    <p className="text-sm font-medium">{activeFault.rootCause}</p>
                  </DetailPanel>

                  <DetailPanel label="Preventive action" className="border-blue-200 bg-blue-50/60 text-blue-950">
                    <p className="text-sm font-medium whitespace-pre-line">{activeFault.preventiveAction}</p>
                  </DetailPanel>
                </div>

                <DetailPanel label="Corrective action">
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-800">
                    {activeFault.correctiveActions.map((action, index) => (
                      <li key={`${activeFault.id}-ca-${index}`} className="leading-relaxed">
                        {action}
                      </li>
                    ))}
                  </ol>
                </DetailPanel>

                {/* Photo and Manual display section */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Manual Screenshot */}
                  <div>
                    <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">
                      Manual Screenshot / Reference
                    </p>
                    {activeFault.manualScreenshotUrl ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img
                          src={activeFault.manualScreenshotUrl}
                          alt={activeFault.manualScreenshotName || "Manual screenshot"}
                          className="max-h-64 w-full object-contain bg-slate-100"
                        />
                        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="truncate font-semibold text-slate-700">
                            {activeFault.manualScreenshotName || "Manual Screenshot"}
                          </span>
                          <a
                            href={activeFault.manualScreenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                          >
                            Full size <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                        No manual screenshot attached
                      </div>
                    )}
                  </div>

                  {/* Supporting Photo */}
                  <div>
                    <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">
                      Supporting Photo
                    </p>
                    {activeFault.supportPhotoUrl ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img
                          src={activeFault.supportPhotoUrl}
                          alt={activeFault.supportPhotoName || "Supporting photo"}
                          className="max-h-64 w-full object-contain bg-slate-100"
                        />
                        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="truncate font-semibold text-slate-700">
                            {activeFault.supportPhotoName || "Supporting Photo"}
                          </span>
                          <a
                            href={activeFault.supportPhotoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                          >
                            Full size <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                        No supporting photo attached
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
                <div className="flex gap-2">
                  {activeFault.dbId && <Button variant="outline" onClick={() => openFaultEditor(activeFault)} className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"><Pencil className="mr-1.5 h-4 w-4" />Edit details</Button>}
                  {activeFault.dbId && <Button variant="outline" onClick={() => { setDetailModalOpen(false); requestFaultDeletion(activeFault); }} className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Trash2 className="mr-1.5 h-4 w-4" />Delete card</Button>}
                </div>
                <Button onClick={() => setDetailModalOpen(false)} className="bg-slate-700 text-white hover:bg-slate-800">Close window</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(faultToDelete)} onOpenChange={open => {
        if (!open && !deleteMutation.isPending) {
          setFaultToDelete(null);
          setDeleteStep(1);
        }
      }}>
        <AlertDialogContent className="max-w-md rounded-2xl border border-rose-100 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteStep === 1 ? "Delete this Faultpedia card?" : "Final confirmation"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteStep === 1
                ? `The card “${faultToDelete?.title || ""}” will be removed from the shared Faultpedia library. Continue only if this is the intended card.`
                : `This permanently removes “${faultToDelete?.title || ""}” from the website library. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} onClick={() => { setFaultToDelete(null); setDeleteStep(1); }}>
              Cancel
            </AlertDialogCancel>
            {deleteStep === 1 ? (
              <AlertDialogAction className="bg-rose-700 text-white hover:bg-rose-800" onClick={event => { event.preventDefault(); setDeleteStep(2); }}>
                Continue
              </AlertDialogAction>
            ) : (
              <AlertDialogAction className="bg-rose-700 text-white hover:bg-rose-800" onClick={() => faultToDelete?.dbId && deleteMutation.mutate({ id: faultToDelete.dbId })}>
                {deleteMutation.isPending ? "Deleting…" : "Yes, delete card"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CREATE TROUBLESHOOTING CARD MODAL */}
      <Dialog open={createModalOpen} onOpenChange={(open) => { if (!open && !createMutation.isPending && !updateMutation.isPending) clearCardEditor(); else setCreateModalOpen(open); }}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-5xl"
          aria-describedby="troubleshoot-card-subtitle"
        >
          <DialogHeader className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-black text-[#24325e]">
                  {editingFault ? "Edit troubleshooting card" : "Create troubleshooting card"}
                </DialogTitle>
                <DialogDescription id="troubleshoot-card-subtitle" className="mt-1 text-sm">
                  {editingFault ? "Update the saved fault details, actions, and attached references." : "Turn a recurring downtime incident into a permanent troubleshooting reference in Faultpedia."}
                </DialogDescription>
              </div>
              <button
                onClick={clearCardEditor}
                aria-label="Close create troubleshooting card modal"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="grid gap-6 px-5 py-5 sm:px-7 lg:grid-cols-2">
            <div className="space-y-4">
              {/* All 21 rides available in dropdown */}
              <div>
                <Label htmlFor="wiki-ride">Ride (All 21 attractions)</Label>
                <Select value={draft.rideCode} onValueChange={(value) => updateDraft("rideCode", value)}>
                  <SelectTrigger id="wiki-ride" className="mt-1.5 h-10 w-full">
                    <SelectValue placeholder="Select an attraction" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {WIKI_RIDES.filter((ride) => ride.code !== "ALL").map((ride) => (
                      <SelectItem key={ride.code} value={ride.code}>
                        <span className="font-bold text-slate-800">{ride.code}</span> · {ride.subtitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="wiki-title">Fault title</Label>
                <Input
                  id="wiki-title"
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="e.g. 24V Fuse Control Voltage Lap Bar Tripped"
                  className="mt-1.5 h-10"
                />
              </div>

              {/* Categories limited to: Electrical & Mechanical & Other */}
              <div>
                <Label>Category</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WIKI_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => updateDraft("category", category)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                        draft.category === category
                          ? "bg-emerald-700 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="wiki-symptom">Symptom / Description</Label>
                <Textarea
                  id="wiki-symptom"
                  value={draft.symptom}
                  onChange={(event) => updateDraft("symptom", event.target.value)}
                  placeholder="Describe what occurs when the fault happens..."
                  className="mt-1.5 min-h-24 resize-y"
                />
              </div>

              <div>
                <Label htmlFor="wiki-cause">Root cause</Label>
                <Textarea
                  id="wiki-cause"
                  value={draft.rootCause}
                  onChange={(event) => updateDraft("rootCause", event.target.value)}
                  placeholder="What is the root cause found during inspection?"
                  className="mt-1.5 min-h-24 resize-y"
                />
              </div>
            </div>

            <div className="space-y-4">
              {/* Corrective Action with auto-numbering */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="wiki-corrective">Corrective action</Label>
                  <span className="text-[11px] text-slate-400">Press Enter for auto-numbering (1. → 2.)</span>
                </div>
                <Textarea
                  id="wiki-corrective"
                  value={draft.correctiveAction}
                  onChange={(event) => updateDraft("correctiveAction", event.target.value)}
                  onKeyDown={(e) => handleAutoNumberKeyDown("correctiveAction", e)}
                  placeholder={"1. Isolate the affected ride vehicle\n2. Check fuse holder tension..."}
                  className="mt-1.5 min-h-28 resize-y font-sans text-sm leading-relaxed"
                />
              </div>

              {/* Preventive Action with auto-numbering */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="wiki-preventive">Preventive action</Label>
                  <span className="text-[11px] text-slate-400">Press Enter for auto-numbering</span>
                </div>
                <Textarea
                  id="wiki-preventive"
                  value={draft.preventiveAction}
                  onChange={(event) => updateDraft("preventiveAction", event.target.value)}
                  onKeyDown={(e) => handleAutoNumberKeyDown("preventiveAction", e)}
                  placeholder={"1. Inspect connector condition during weekly PM..."}
                  className="mt-1.5 min-h-24 resize-y font-sans text-sm leading-relaxed"
                />
              </div>

              {/* Drag-and-drop Upload with Delete before save */}
              <InteractiveDropzone
                label="Manual screenshot"
                helper="Drag & drop screenshot, or click to browse"
                uploaded={manualUpload}
                onFileSelected={(file) => handleFileUpload(file, setManualUpload)}
                onDelete={() => setManualUpload(null)}
                isUploading={isUploading}
              />

              <InteractiveDropzone
                label="Supporting photos"
                helper="Drag & drop supporting photo, or click to browse"
                uploaded={photoUpload}
                onFileSelected={(file) => handleFileUpload(file, setPhotoUpload)}
                onDelete={() => setPhotoUpload(null)}
                isUploading={isUploading}
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="flex max-w-lg items-center gap-2 text-left text-xs text-slate-500">
              <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              Cards are saved directly to the website system database and remain visible after page reloads.
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="outline"
                onClick={clearCardEditor}
                className="flex-1 bg-white sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                onClick={saveCard}
                disabled={createMutation.isPending || updateMutation.isPending || isUploading}
                className="flex-1 bg-emerald-700 text-white hover:bg-emerald-800 sm:flex-none"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving to database..." : editingFault ? "Save changes" : "Save troubleshooting card"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function DetailPanel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 ${className}`}>
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">{label}</p>
      {children}
    </div>
  );
}

function MetricTile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof FileText;
  value: string;
  label: string;
  tone: string;
}) {
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

/**
 * Drag-and-drop dropzone with immediate delete option before saving
 */
function InteractiveDropzone({
  label,
  helper,
  uploaded,
  onFileSelected,
  onDelete,
  isUploading,
}: {
  label: string;
  helper: string;
  uploaded: UploadedFileState | null;
  onFileSelected: (file: File) => void;
  onDelete: () => void;
  isUploading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <div>
      <Label>{label}</Label>
      {uploaded ? (
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50/60 p-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <img
              src={uploaded.url}
              alt={uploaded.name}
              className="h-10 w-10 shrink-0 rounded-lg object-cover border border-emerald-200 bg-white"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800">{uploaded.name}</p>
              <p className="text-[10px] text-emerald-700 font-semibold">Ready to save</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title="Delete this photo before saving"
            className="h-8 w-8 p-0 text-slate-500 hover:bg-rose-100 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-1.5 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 text-center transition ${
            isDragOver
              ? "border-emerald-500 bg-emerald-50/80"
              : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40"
          }`}
        >
          <ImagePlus className={`h-5 w-5 ${isDragOver ? "text-emerald-600" : "text-slate-400"}`} />
          <span className="mt-1 text-xs font-bold text-slate-700">{helper}</span>
          <span className="mt-0.5 text-[10px] text-slate-500">PNG, JPG up to 10 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleInputChange}
            disabled={isUploading}
          />
        </div>
      )}
    </div>
  );
}
