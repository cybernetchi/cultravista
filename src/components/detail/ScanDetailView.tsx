// Mobile capture detail — a read-only view of a finished capture on the phone.
// The viewer + bilingual metadata + hotspot tour are reused wholesale from the
// public ExhibitView (the same responsive, r3f-backed renderer used at
// /exhibit/:slug), so mobile stays in parity with the web/exhibit experience
// without re-implementing the 3D story. Heavy curation (editing, hotspot
// authoring, cropping, publishing) stays on desktop — we only overlay a back
// button, a share affordance for already-published exhibits, and a hint.
import { useState } from "react";
import { ChevronLeft, Share2, Monitor, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExhibitView } from "@/components/exhibit/ExhibitView";
import { AnnotationService } from "@/services/annotationService";
import { Capture } from "@/services/captureService";
import { toast } from "sonner";

interface ScanDetailViewProps {
  capture: Capture;
  onBack: () => void;
}

export function ScanDetailView({ capture, onBack }: ScanDetailViewProps) {
  const [sharing, setSharing] = useState(false);

  // Hotspots for this capture (drives ExhibitView's markers + guided tour).
  const { data: annotations = [], isLoading: annotationsLoading } = useQuery({
    queryKey: ["annotations", capture.id],
    queryFn: async () => {
      const res = await AnnotationService.getAnnotations(capture.id);
      if (!res.success) throw new Error(res.error);
      return res.data ?? [];
    },
  });

  const canShare = capture.published && !!capture.slug;

  const handleShare = async () => {
    if (!capture.slug) return;
    const url = `${window.location.origin}/exhibit/${capture.slug}`;
    // Prefer the native share sheet on phones; fall back to clipboard.
    if (navigator.share) {
      try {
        setSharing(true);
        await navigator.share({ title: capture.title, url });
      } catch {
        /* user cancelled — no-op */
      } finally {
        setSharing(false);
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Exhibit link copied");
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background animate-fade-in">
      {/* Viewer + metadata + tour, reused from the public exhibit renderer. */}
      <ExhibitView capture={capture} annotations={annotations} />

      {/* Loading hint while hotspots resolve (viewer already renders underneath). */}
      {annotationsLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50">
          <span className="flex items-center gap-1.5 rounded-full bg-card/85 backdrop-blur-sm border border-border px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading story…
          </span>
        </div>
      )}

      {/* Top-left controls (ExhibitView keeps the language toggle top-right). */}
      <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
        <Button
          variant="icon"
          size="icon"
          onClick={onBack}
          className="bg-card/85 backdrop-blur-sm border border-border"
          aria-label="Back to library"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
        {canShare && (
          <Button
            variant="icon"
            size="icon"
            onClick={handleShare}
            disabled={sharing}
            className="bg-card/85 backdrop-blur-sm border border-border"
            aria-label="Share exhibit"
          >
            <Share2 className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Desktop-only tooling hint. */}
      <div className="absolute bottom-3 left-3 z-40">
        <span className="flex items-center gap-1.5 rounded-full bg-card/85 backdrop-blur-sm border border-border px-3 py-1 text-xs text-muted-foreground">
          <Monitor className="w-3.5 h-3.5" />
          Edit &amp; curate on desktop
        </span>
      </div>
    </div>
  );
}
