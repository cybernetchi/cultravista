import { Capture, deliverySplatUrl } from "@/services/captureService";
import { SplatThumbnail } from "@/components/web/SplatThumbnail";
import { cn } from "@/lib/utils";
import { Loader2, Trash2 } from "lucide-react";

interface ScanCardProps {
  capture: Capture;
  onClick: () => void;
  /** Asks the parent to confirm + delete. Shown on failed scans, which have no detail view. */
  onDelete?: () => void;
  index: number;
}

export function ScanCard({ capture, onClick, onDelete, index }: ScanCardProps) {
  // A capture is renderable once it has any delivery splat URL — KIRI captures
  // get folder_path from the Lambda, while direct .splat uploads (PR8) only set
  // `file`. deliverySplatUrl resolves both.
  const hasModel = !!deliverySplatUrl(capture);
  // Processing state: status 0 = processing, or status 1 complete but no
  // delivery file yet (Lambda still converting PLY→splat).
  const isProcessing = capture.status === 0 || (capture.status === 1 && !hasModel);
  const isFailed = capture.status === 2;
  const isClickable = capture.status === 1 && hasModel;

  const getStatusLabel = () => {
    if (capture.status === 0) return "Processing";
    if (capture.status === 2) return "Failed";
    if (capture.status === 1 && !hasModel) return "Converting";
    return "";
  };

  const handleClick = () => {
    if (isClickable) onClick();
  };

  return (
    // A wrapper div (not the card button itself) hosts the delete control —
    // nesting a <button> inside a <button> is invalid HTML.
    <div
      className="relative animate-fade-up"
      style={{ animationDelay: `${index * 100}ms` }}
    >
    <button
      onClick={handleClick}
      disabled={!isClickable}
      className={cn(
        "group relative w-full aspect-square rounded-2xl overflow-hidden bg-card",
        "transition-all duration-500",
        isClickable && "hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
        !isClickable && "cursor-not-allowed opacity-80"
      )}
    >
      {/* Completed captures show a snapshot of the actual 3D model (same as the
          web library); processing/failed ones fall back to the source photo. */}
      {isClickable && deliverySplatUrl(capture) ? (
        // NB: sized box, not "absolute inset-0" — SplatThumbnail's root is
        // position:relative, and Tailwind resolves relative+absolute in favour
        // of relative, so an inset-based size collapses to zero height.
        <SplatThumbnail
          splatUrl={deliverySplatUrl(capture)!}
          fallbackImage={capture.thumbnail || "/placeholder.svg"}
          captureId={capture.id}
          className="w-full h-full"
        />
      ) : (
        <img
          src={capture.thumbnail || "/placeholder.svg"}
          alt={capture.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      )}

      {/* Processing/Failed overlay */}
      {(isProcessing || isFailed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-2">
            {isProcessing && <Loader2 className="h-6 w-6 text-white animate-spin" />}
            <span className={cn("text-sm font-medium", isFailed ? "text-red-400" : "text-white")}>
              {getStatusLabel()}
            </span>
          </div>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
        <h3 className="text-sm font-semibold text-foreground truncate">{capture.title}</h3>
      </div>

      {/* Hover glow effect */}
      {isClickable && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="absolute inset-0 border-2 border-primary/30 rounded-2xl" />
        </div>
      )}
    </button>

    {/* Delete for failed captures — sibling of the card button, above it. */}
    {isFailed && onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete failed capture ${capture.title}`}
        className={cn(
          "absolute top-2 right-2 z-30",
          "flex h-9 w-9 items-center justify-center rounded-lg",
          "bg-black/60 text-red-400 backdrop-blur-sm",
          "active:scale-95 transition-transform"
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
    </div>
  );
}
