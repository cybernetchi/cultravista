import { Scan } from "@/types/scan";
import { cn } from "@/lib/utils";
import { Calendar, MapPin, Loader2 } from "lucide-react";
import { SplatThumbnail } from "./SplatThumbnail";

interface WebScanCardProps {
  scan: Scan;
  onClick: () => void;
  viewMode: "grid" | "list";
  index: number;
}

export function WebScanCard({ scan, onClick, viewMode, index }: WebScanCardProps) {
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
    // Completed scans render a live snapshot of the actual 3D model; processing/
    // failed ones (no usable splat yet) fall back to the static image.
    if (isClickable && scan.splatUrl) {
      return (
        <SplatThumbnail
          splatUrl={scan.splatUrl}
          fallbackImage={scan.thumbnail}
          className={className}
        />
      );
    }
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

    </div>
  );
}
