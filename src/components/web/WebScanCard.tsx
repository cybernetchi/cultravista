import { Scan } from "@/types/scan";
import { cn } from "@/lib/utils";
import { Calendar, MapPin, MoreVertical, Star, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WebScanCardProps {
  scan: Scan;
  onClick: () => void;
  viewMode: "grid" | "list";
  index: number;
  /** Delete this capture (offered only for processing/failed cards). */
  onDelete?: () => void;
}

// Confirm-guarded delete trigger for stuck ("Processing") or failed captures.
// Rendered inside a card, so clicks must not bubble into the card handler.
function DeleteCaptureButton({
  scan,
  isProcessing,
  onDelete,
}: {
  scan: Scan;
  isProcessing: boolean;
  onDelete: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-background/50 backdrop-blur-sm text-muted-foreground hover:text-destructive"
          onClick={(e) => e.stopPropagation()}
          title="Delete capture"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{scan.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {isProcessing
              ? "This capture is still marked as processing. If it is stuck, deleting removes it from your library permanently; if processing is genuinely underway, that work will be discarded."
              : "This capture failed to process. Deleting removes it from your library permanently."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WebScanCard({ scan, onClick, viewMode, index, onDelete }: WebScanCardProps) {
  // Processing state: status 0 = processing, or status 1 complete but no folderPath yet
  const isProcessing = scan.status === 0 || (scan.status === 1 && !scan.folderPath);
  const isFailed = scan.status === 2;
  const isClickable = scan.status === 1 && scan.folderPath;

  const getStatusLabel = () => {
    if (scan.status === 0) return "Processing";
    if (scan.status === 2) return "Failed";
    if (scan.status === 1 && !scan.folderPath) return "Converting";
    return "";
  };

  const handleClick = () => {
    if (isClickable) {
      onClick();
    }
  };

  const formattedDate = scan.createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const renderThumbnail = (className: string) => {
    return (
      <img
        src={scan.thumbnail}
        alt={scan.title}
        className={`${className} object-cover`}
      />
    );
  };

  if (viewMode === "list") {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "group flex items-center gap-4 p-4 rounded-xl",
          "bg-card border border-border/50",
          "transition-all duration-300",
          "animate-fade-in",
          isClickable && "cursor-pointer hover:border-primary/30 hover:bg-card/80",
          !isClickable && "cursor-not-allowed opacity-70"
        )}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 relative">
          {renderThumbnail("w-full h-full")}
          {/* Processing overlay */}
          {(isProcessing || isFailed) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              {isProcessing && <Loader2 className="h-5 w-5 text-white animate-spin" />}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {scan.title}
            </h3>
            {(isProcessing || isFailed) && (
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                isFailed ? "bg-red-500/20 text-red-400" : "bg-primary/20 text-primary"
              )}>
                {getStatusLabel()}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{scan.authorHandle}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formattedDate}
            </span>
            {scan.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {scan.location}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {(isProcessing || isFailed) && onDelete ? (
          // Stuck/failed rows: always-visible delete so cleanup is discoverable.
          <div className="flex items-center gap-2">
            <DeleteCaptureButton scan={scan} isProcessing={isProcessing} onDelete={onDelete} />
          </div>
        ) : (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Star className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative rounded-2xl overflow-hidden",
        "bg-card border border-border/50",
        "transition-all duration-300",
        "animate-fade-in",
        isClickable && "cursor-pointer hover:border-primary/30 hover:scale-[1.02] hover:shadow-[0_0_30px_hsl(110_100%_55%/0.15)]",
        !isClickable && "cursor-not-allowed opacity-70"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Image/Splat */}
      <div className="aspect-[4/3] overflow-hidden relative">
        {renderThumbnail("w-full h-full")}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none" />
        
        {/* Processing/Failed overlay */}
        {(isProcessing || isFailed) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-2">
              {isProcessing && (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              )}
              <span className={cn(
                "text-sm font-medium",
                isFailed ? "text-red-400" : "text-white"
              )}>
                {getStatusLabel()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {scan.title}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-muted-foreground">{scan.authorHandle}</p>
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
        </div>
      </div>

      {/* Delete for stuck/failed cards — always visible so cleanup is discoverable */}
      {(isProcessing || isFailed) && onDelete && (
        <div className="absolute top-3 right-3 z-30">
          <DeleteCaptureButton scan={scan} isProcessing={isProcessing} onDelete={onDelete} />
        </div>
      )}

      {/* Hover actions - only show when clickable */}
      {isClickable && (
        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <Star className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
