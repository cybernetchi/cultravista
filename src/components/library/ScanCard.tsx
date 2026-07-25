import { Scan } from "@/types/scan";
import { cn } from "@/lib/utils";
import { Loader2, Trash2 } from "lucide-react";
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

interface ScanCardProps {
  scan: Scan;
  onClick: () => void;
  index: number;
  /** Delete this capture (offered only for processing/failed cards). */
  onDelete?: () => void;
}

export function ScanCard({ scan, onClick, index, onDelete }: ScanCardProps) {
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

  return (
    // A div (not a button) so the nested delete control stays clickable while
    // the card itself is in a non-clickable processing/failed state.
    <div
      onClick={handleClick}
      role="button"
      tabIndex={isClickable ? 0 : -1}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative aspect-square rounded-2xl overflow-hidden bg-card",
        "transition-all duration-500",
        "animate-fade-up",
        isClickable && "hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
        !isClickable && "cursor-not-allowed opacity-80"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <img
        src={scan.thumbnail}
        alt={scan.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />

      {/* Processing/Failed overlay */}
      {(isProcessing || isFailed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-2">
            {isProcessing && (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
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

      {/* Delete for stuck/failed cards — always visible (no hover on touch) */}
      {(isProcessing || isFailed) && onDelete && (
        <div className="absolute top-2 right-2 z-30">
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
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {scan.title}
        </h3>
        <p className="text-xs text-primary font-medium">
          {scan.authorHandle}
        </p>
      </div>

      {/* Hover glow effect */}
      {isClickable && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="absolute inset-0 border-2 border-primary/30 rounded-2xl" />
        </div>
      )}
    </div>
  );
}
