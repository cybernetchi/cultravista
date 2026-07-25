import { useState, useEffect, type ReactNode } from "react";
import {
  Languages,
  Play,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Scale,
  Pencil,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GaussianSplatViewer } from "@/components/web/GaussianSplatViewer";
import { deliverySplatUrl, type Capture } from "@/services/captureService";
import type { Annotation } from "@/types/scan";

interface ExhibitViewProps {
  capture: Capture;
  annotations: Annotation[];
  /** Chromeless mode for iframe embeds. */
  embed?: boolean;
}

// Public, responsive exhibit renderer: the 3D model with hotspots + a guided
// tour and bilingual metadata. Used by /exhibit/:slug (full) and the embed.
export function ExhibitView({ capture, annotations, embed = false }: ExhibitViewProps) {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const splatUrl = deliverySplatUrl(capture);

  const hasZh = Boolean(
    capture.title_zh_hant ||
      capture.description_zh_hant ||
      annotations.some((a) => a.titleZhHant || a.bodyZhHant)
  );

  const title = lang === "zh" && capture.title_zh_hant ? capture.title_zh_hant : capture.title;
  const description =
    lang === "zh" && capture.description_zh_hant
      ? capture.description_zh_hant
      : capture.description;

  const active =
    tourIndex != null
      ? annotations[tourIndex] ?? null
      : annotations.find((a) => a.id === selectedId) ?? null;
  const annTitle = active
    ? lang === "zh" && active.titleZhHant
      ? active.titleZhHant
      : active.title
    : null;
  const annBody = active
    ? lang === "zh" && active.bodyZhHant
      ? active.bodyZhHant
      : active.body
    : null;

  // Auto-advance the tour.
  useEffect(() => {
    if (tourIndex == null) return;
    const t = setTimeout(() => {
      setTourIndex((idx) => (idx == null ? null : idx + 1 < annotations.length ? idx + 1 : null));
    }, 6000);
    return () => clearTimeout(t);
  }, [tourIndex, annotations.length]);

  const startTour = () => {
    if (annotations.length === 0) return;
    setSelectedId(null);
    setTourIndex(0);
  };
  const stepTour = (dir: -1 | 1) =>
    setTourIndex((idx) => {
      if (idx == null) return idx;
      const next = idx + dir;
      return next >= 0 && next < annotations.length ? next : idx;
    });

  const captureDate = capture.capture_date ? new Date(capture.capture_date) : null;

  // Tour controls (shared between full + embed layouts).
  const tourBar =
    annotations.length > 0 ? (
      <div className="flex items-center gap-2">
        {tourIndex == null ? (
          <Button size="sm" variant="captureOutline" className="h-8 gap-1.5" onClick={startTour}>
            <Play className="w-3.5 h-3.5" />
            Play tour
          </Button>
        ) : (
          <div className="flex items-center gap-1 rounded-full bg-card/90 backdrop-blur-sm border border-border px-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => stepTour(-1)} disabled={tourIndex === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-1">{tourIndex + 1}/{annotations.length}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => stepTour(1)} disabled={tourIndex === annotations.length - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setTourIndex(null)}>Exit</Button>
          </div>
        )}
      </div>
    ) : null;

  const langToggle = hasZh ? (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 gap-1.5 bg-card/80 backdrop-blur-sm border border-border"
      onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
    >
      <Languages className="w-4 h-4" />
      {lang === "en" ? "繁中" : "EN"}
    </Button>
  ) : null;

  const viewer = splatUrl ? (
    <GaussianSplatViewer
      src={splatUrl}
      title={title}
      className="absolute inset-0 rounded-none border-0"
      annotations={annotations}
      mode="view"
      selectedId={active?.id ?? null}
      onSelectAnnotation={(id) => {
        setTourIndex(null);
        setSelectedId(id);
      }}
      tourIndex={tourIndex}
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <img src={capture.thumbnail ?? "/placeholder.svg"} alt={title} className="max-h-full max-w-full object-contain" />
    </div>
  );

  // ---- Embed: chromeless, viewer fills the frame with minimal overlays ----
  if (embed) {
    return (
      <div className="relative h-screen w-screen bg-black">
        {viewer}
        <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2">
          <span className="rounded-md bg-card/85 backdrop-blur-sm border border-border px-2.5 py-1 text-sm font-medium text-foreground">
            {title}
          </span>
          {langToggle}
        </div>
        {/* bottom-14 keeps the tour controls clear of the viewer's own
            bottom-anchored controls hint. */}
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">{tourBar}</div>
        {active && (annTitle || annBody) && (
          <div className="absolute bottom-28 left-3 right-3 z-20 mx-auto max-w-md rounded-lg bg-card/90 backdrop-blur-sm border border-border p-3">
            <p className="font-medium text-foreground text-sm">{annTitle || "Hotspot"}</p>
            {annBody && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{annBody}</p>}
          </div>
        )}
      </div>
    );
  }

  // ---- Full page: viewer + metadata, responsive (stacked on mobile) ----
  return (
    <div className="flex h-screen w-screen flex-col bg-background md:flex-row">
      {/* Viewer */}
      <div className="relative flex-1 min-h-[45vh] md:min-h-0 bg-black">
        {viewer}
        <div className="absolute top-3 right-3 z-20">{langToggle}</div>
        {/* bottom-14 keeps the tour controls clear of the viewer's own
            bottom-anchored controls hint. */}
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">{tourBar}</div>
      </div>

      {/* Metadata */}
      <aside className="w-full md:w-96 shrink-0 overflow-y-auto border-t md:border-t-0 md:border-l border-border p-6 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Exhibit</p>
          <h1 className="text-2xl font-bold text-foreground mt-1">{title}</h1>
        </div>

        {/* Active hotspot narration */}
        {active && (annTitle || annBody) && (
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="font-medium text-foreground text-sm">{annTitle || "Hotspot"}</p>
            {annBody && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{annBody}</p>}
          </div>
        )}

        {/* Provenance */}
        <div className="space-y-3 py-4 border-y border-border text-sm">
          {captureDate && (
            <Row icon={<Calendar className="w-4 h-4 text-primary" />} label="Captured" value={captureDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
          )}
          {capture.location_text && <Row icon={<MapPin className="w-4 h-4 text-primary" />} label="Location" value={capture.location_text} />}
          {capture.rights_license && <Row icon={<Scale className="w-4 h-4 text-primary" />} label="Licence" value={capture.rights_license} />}
          {capture.attribution && <Row icon={<Pencil className="w-4 h-4 text-primary" />} label="Attribution" value={capture.attribution} />}
        </div>

        {/* Description */}
        {description && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Description</h4>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{description}</p>
          </div>
        )}

        {/* Tags */}
        {capture.tags && capture.tags.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" /> Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {capture.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>
        )}

        <p className="pt-4 text-xs text-muted-foreground/70">Powered by CultraVista</p>
      </aside>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto text-foreground text-right truncate max-w-[180px]">{value}</span>
    </div>
  );
}
