import { useState } from "react";
import { Search, Grid, List, Plus, Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScanCard } from "./ScanCard";
import { CaptureService, Capture } from "@/services/captureService";
import { cn } from "@/lib/utils";

interface LibraryViewProps {
  onSelectCapture: (capture: Capture) => void;
  onStartCapture: () => void;
}

export function LibraryView({ onSelectCapture, onStartCapture }: LibraryViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: captures, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["captures"],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch captures");
      }
      return result.data || [];
    },
    // Poll every 5 seconds while anything is still processing/converting.
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasProcessing = data?.some((c: Capture) => c.status === 0 || (c.status === 1 && !c.folder_path));
      return hasProcessing ? 5000 : false;
    },
  });

  // Search real titles (English + Traditional Chinese when present).
  const q = searchQuery.trim().toLowerCase();
  const filtered = (captures || []).filter((c) => {
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      (c.title_zh_hant?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="flex-1 flex flex-col pb-24">
      {/* Header */}
      <header className="px-5 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">Library</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="icon"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh library"
            >
              <RefreshCw className={cn("w-5 h-5", isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="icon"
              size="icon"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              aria-label="Toggle layout"
            >
              {viewMode === "grid" ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search captures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full h-12 pl-12 pr-4 rounded-xl",
              "bg-secondary border-none",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "transition-all duration-300"
            )}
          />
        </div>
      </header>

      {/* Grid */}
      <div className="flex-1 px-5 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <p className="text-destructive">Failed to load captures</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p>{q ? "No matches" : "No captures yet"}</p>
            <p className="text-sm">{q ? "Try a different search" : "Create a new capture to get started"}</p>
          </div>
        ) : (
          <div className={cn("grid gap-3", viewMode === "grid" ? "grid-cols-2" : "grid-cols-1")}>
            {filtered.map((capture, index) => (
              <ScanCard
                key={capture.id}
                capture={capture}
                onClick={() => onSelectCapture(capture)}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating action button */}
      <button
        onClick={onStartCapture}
        className={cn(
          "fixed bottom-24 right-5",
          "w-14 h-14 rounded-full",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "shadow-glow hover:shadow-glow-lg",
          "transition-all duration-300 hover:scale-110 active:scale-95",
          "animate-fade-in"
        )}
        aria-label="New capture"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
