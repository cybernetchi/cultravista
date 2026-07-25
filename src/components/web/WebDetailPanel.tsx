import { Scan } from "@/types/scan";
import { cn } from "@/lib/utils";
import {
  X,
  Calendar,
  MapPin,
  Share2,
  Download,
  Edit2,
  Pencil,
  Star,
  MoreHorizontal,
  Box,
  Image,
  Scale,
  Tag,
  Languages,
  Play,
  ChevronLeft,
  ChevronRight,
  MapPin as MapPinIcon,
  Crop,
  Trash2
} from "lucide-react";
// (MoreHorizontal removed with the fake stats/actions cleanup)
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GaussianSplatViewer } from "./GaussianSplatViewer";
import { AnnotationService } from "@/services/annotationService";
import { CaptureService } from "@/services/captureService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Loader2, Copy, Globe } from "lucide-react";
import { toast } from "sonner";

interface WebDetailPanelProps {
  scan: Scan;
  onClose: () => void;
  onEdit: () => void;
  onAnnotate: () => void;
  onCrop: () => void;
}

export function WebDetailPanel({ scan, onClose, onEdit, onAnnotate, onCrop }: WebDetailPanelProps) {
  const [viewMode, setViewMode] = useState<"image" | "3d">(scan.splatUrl ? "3d" : "image");
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [tourIndex, setTourIndex] = useState<number | null>(null);

  // Load this capture's hotspots.
  const { data: annotations = [] } = useQuery({
    queryKey: ["annotations", scan.id],
    queryFn: async () => {
      const res = await AnnotationService.getAnnotations(scan.id);
      if (!res.success) throw new Error(res.error);
      return res.data ?? [];
    },
  });

  // The hotspot currently shown in the side panel (tour stop or manual select).
  const activeAnnotation =
    tourIndex != null
      ? annotations[tourIndex] ?? null
      : annotations.find((a) => a.id === selectedAnnotationId) ?? null;

  // Auto-advance the tour every few seconds.
  useEffect(() => {
    if (tourIndex == null) return;
    const t = setTimeout(() => {
      setTourIndex((idx) => (idx == null ? null : idx + 1 < annotations.length ? idx + 1 : null));
    }, 6000);
    return () => clearTimeout(t);
  }, [tourIndex, annotations.length]);

  const startTour = () => {
    if (annotations.length === 0) return;
    setSelectedAnnotationId(null);
    setViewMode("3d");
    setTourIndex(0);
  };
  const stepTour = (dir: -1 | 1) => {
    setTourIndex((idx) => {
      if (idx == null) return idx;
      const next = idx + dir;
      return next >= 0 && next < annotations.length ? next : idx;
    });
  };
  const exitTour = () => setTourIndex(null);

  // Localized text for the active hotspot.
  const annTitle = activeAnnotation
    ? (lang === "zh" && activeAnnotation.titleZhHant ? activeAnnotation.titleZhHant : activeAnnotation.title)
    : null;
  const annBody = activeAnnotation
    ? (lang === "zh" && activeAnnotation.bodyZhHant ? activeAnnotation.bodyZhHant : activeAnnotation.body)
    : null;

  // ---- Publishing / sharing (PR4) ----
  const queryClient = useQueryClient();
  const [published, setPublished] = useState(!!scan.published);
  const [slug, setSlug] = useState<string | null>(scan.slug ?? null);
  const [publishBusy, setPublishBusy] = useState(false);

  const exhibitUrl = slug ? `${window.location.origin}/exhibit/${slug}` : "";
  const embedSnippet = slug
    ? `<iframe src="${window.location.origin}/iframe-viewer?slug=${slug}" width="100%" height="600" style="border:0" allow="accelerometer; gyroscope; magnetometer"></iframe>`
    : "";

  const handlePublishToggle = async () => {
    setPublishBusy(true);
    const res = published
      ? await CaptureService.unpublishCapture(scan.id)
      : await CaptureService.publishCapture(scan.id, scan.title);
    setPublishBusy(false);
    if (!res.success || !res.data) {
      toast.error(res.error || "Action failed");
      return;
    }
    setPublished(res.data.published);
    setSlug(res.data.slug);
    queryClient.invalidateQueries({ queryKey: ["captures"] });
    toast.success(res.data.published ? "Exhibit published" : "Exhibit unpublished");
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  // ---- Delete ----
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const handleDelete = async () => {
    setDeleteBusy(true);
    const res = await CaptureService.deleteCapture(scan.id);
    setDeleteBusy(false);
    if (!res.success) {
      toast.error(res.error || "Failed to delete scan");
      return;
    }
    setDeleteOpen(false);
    queryClient.invalidateQueries({ queryKey: ["captures"] });
    toast.success("Scan deleted");
    onClose(); // back to the library
  };

  // Whether Traditional Chinese content exists to offer a language toggle.
  const hasZh = Boolean(scan.titleZhHant || scan.descriptionZhHant);

  // Resolve displayed text by language, falling back to English.
  const displayTitle =
    lang === "zh" && scan.titleZhHant ? scan.titleZhHant : scan.title;
  const displayDescription =
    lang === "zh" && scan.descriptionZhHant
      ? scan.descriptionZhHant
      : scan.description;

  // Prefer the curator-supplied capture date; fall back to the created date.
  const dateToShow = scan.captureDate ? new Date(scan.captureDate) : scan.createdAt;
  const formattedDate = dateToShow.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dateLabel = scan.captureDate ? "Captured" : "Created";

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Floating Panel */}
      <div className={cn(
        "fixed inset-4 md:inset-8 lg:inset-12 z-50",
        "bg-card border border-border rounded-2xl shadow-2xl",
        "flex overflow-hidden animate-scale-in"
      )}>
        {/* Left side - Model Preview (major portion) */}
        <div className="flex-1 flex flex-col min-w-0 bg-secondary/30">
          {/* Preview Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-foreground text-lg">{displayTitle}</h2>
              {scan.splatUrl && (
                <div className="flex items-center bg-secondary rounded-lg p-1">
                  <Button
                    variant={viewMode === "3d" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-3 gap-1.5"
                    onClick={() => setViewMode("3d")}
                  >
                    <Box className="w-3.5 h-3.5" />
                    3D
                  </Button>
                  <Button
                    variant={viewMode === "image" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-3 gap-1.5"
                    onClick={() => setViewMode("image")}
                  >
                    <Image className="w-3.5 h-3.5" />
                    Image
                  </Button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Preview Content */}
          <div className="flex-1 relative min-h-0">
            {viewMode === "3d" && scan.splatUrl ? (
              <GaussianSplatViewer
                src={scan.splatUrl}
                title={displayTitle}
                className="absolute inset-0 rounded-none border-0"
                annotations={annotations}
                mode="view"
                selectedId={activeAnnotation?.id ?? null}
                onSelectAnnotation={(id) => {
                  setTourIndex(null);
                  setSelectedAnnotationId(id);
                }}
                tourIndex={tourIndex}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <img
                  src={scan.thumbnail}
                  alt={scan.title}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right side - Details Panel */}
        <div className="w-80 lg:w-96 flex flex-col border-l border-border bg-card">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-medium text-foreground">Details</h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Title + language toggle */}
            <div className="mb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-foreground">{displayTitle}</h1>
                  {scan.authorHandle && (
                    <p className="text-sm text-muted-foreground mt-1">{scan.authorHandle}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {hasZh && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
                      title="Toggle language"
                    >
                      <Languages className="w-4 h-4" />
                      {lang === "en" ? "繁中" : "EN"}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Star className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-3 py-4 border-y border-border">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <span className="text-muted-foreground">{dateLabel}</span>
                <span className="ml-auto text-foreground text-right">{formattedDate}</span>
              </div>
              {scan.locationText && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">Location</span>
                  <span className="ml-auto text-foreground text-right truncate max-w-[160px]">{scan.locationText}</span>
                </div>
              )}
              {scan.rightsLicense && (
                <div className="flex items-center gap-3 text-sm">
                  <Scale className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">Licence</span>
                  <span className="ml-auto text-foreground text-right truncate max-w-[160px]">{scan.rightsLicense}</span>
                </div>
              )}
              {scan.attribution && (
                <div className="flex items-center gap-3 text-sm">
                  <Pencil className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">Attribution</span>
                  <span className="ml-auto text-foreground text-right truncate max-w-[160px]">{scan.attribution}</span>
                </div>
              )}
            </div>

            {/* Spatial story / hotspots + tour */}
            {annotations.length > 0 && (
              <div className="py-4 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <MapPinIcon className="w-4 h-4 text-primary" />
                    Hotspots ({annotations.length})
                  </h4>
                  {tourIndex == null ? (
                    <Button size="sm" variant="captureOutline" className="h-7 gap-1.5" onClick={startTour}>
                      <Play className="w-3.5 h-3.5" />
                      Play tour
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepTour(-1)} disabled={tourIndex === 0}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground">{tourIndex + 1}/{annotations.length}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => stepTour(1)} disabled={tourIndex === annotations.length - 1}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={exitTour}>Exit</Button>
                    </div>
                  )}
                </div>
                {activeAnnotation ? (
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="font-medium text-foreground text-sm">{annTitle || "Untitled hotspot"}</p>
                    {annBody && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{annBody}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Click a numbered marker, or play the tour.</p>
                )}
              </div>
            )}

            {/* Description */}
            <div className="py-4">
              <h4 className="text-sm font-medium text-foreground mb-2">Description</h4>
              {displayDescription ? (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {displayDescription}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  No description yet. Use Edit to add one.
                </p>
              )}
            </div>

            {/* Tags */}
            {scan.tags && scan.tags.length > 0 && (
              <div className="pb-4">
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {scan.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="captureOutline" className="gap-2" onClick={onEdit}>
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
              <Button variant="captureOutline" className="gap-2" onClick={onAnnotate}>
                <Pencil className="w-4 h-4" />
                Annotate
              </Button>
            </div>
            <Button
              variant="captureOutline"
              className="w-full gap-2"
              onClick={onCrop}
              disabled={!scan.splatUrl}
            >
              <Crop className="w-4 h-4" />
              Crop & Clean Up
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share exhibit</DialogTitle>
                    <DialogDescription>
                      {published
                        ? "This exhibit is public. Anyone with the link can view it."
                        : "Publish to make this capture viewable by anyone with the link."}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <Button
                      variant={published ? "outline" : "capture"}
                      className="w-full gap-2"
                      onClick={handlePublishToggle}
                      disabled={publishBusy}
                    >
                      {publishBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      {published ? "Unpublish" : "Publish exhibit"}
                    </Button>

                    {published && slug && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Exhibit link</label>
                          <div className="flex gap-2">
                            <input readOnly value={exhibitUrl} className="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground" />
                            <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy(exhibitUrl, "Link")}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Embed (iframe)</label>
                          <div className="flex gap-2">
                            <textarea readOnly value={embedSnippet} rows={3} className="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground resize-none" />
                            <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy(embedSnippet, "Embed code")}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="secondary" className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>

            {/* Delete (destructive, confirmed) */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete scan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this scan?</DialogTitle>
                  <DialogDescription>
                    “{scan.title}” and its 3D model will be permanently removed. This
                    can’t be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={handleDelete}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </>
  );
}
