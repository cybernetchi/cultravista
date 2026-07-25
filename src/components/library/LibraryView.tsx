import { useState } from "react";
import { Search, Grid, List, Plus, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScanCard } from "./ScanCard";
import { Scan } from "@/types/scan";
import { CaptureService, Capture } from "@/services/captureService";
import { cn } from "@/lib/utils";

// Convert database capture to Scan type
function captureToScan(capture: Capture): Scan {
  const folderPath = capture.folder_path || undefined;
  const splatUrl = folderPath ? `${folderPath}/output.splat` : undefined;
  
  // Debug logging
  console.log('Converting capture to scan:', capture);
  console.log('Generated splatUrl:', splatUrl);
  
  return {
    id: capture.id,
    title: capture.title,
    author: "User",
    authorHandle: "@user",
    thumbnail: capture.thumbnail || "/placeholder.svg",
    createdAt: new Date(capture.created_at),
    splatUrl,
    status: capture.status, // 0=processing, 1=complete, 2=failed
    folderPath,
  };
}

interface LibraryViewProps {
  onSelectScan: (scan: Scan) => void;
  onStartCapture: () => void;
}

export function LibraryView({ onSelectScan, onStartCapture }: LibraryViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Delete a stuck/failed capture (offered on its card, behind a confirm).
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await CaptureService.deleteCapture(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete capture');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures'] });
      toast.success('Capture deleted');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete capture');
    },
  });

  const { data: captures, isLoading, error } = useQuery({
    queryKey: ['captures'],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch captures');
      }
      return result.data || [];
    },
    // Poll every 5 seconds if there are any processing items
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasProcessing = data?.some((c: Capture) => c.status === 0 || (c.status === 1 && !c.folder_path));
      return hasProcessing ? 5000 : false;
    },
  });

  const scans = captures?.map(captureToScan) || [];

  const filteredScans = scans.filter(scan =>
    scan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    scan.authorHandle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col pb-24">
      {/* Header */}
      <header className="px-5 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">
            Library
          </h1>
          <Button
            variant="icon"
            size="icon"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search scans..."
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
          <div className="flex items-center justify-center h-32">
            <p className="text-destructive">Failed to load scans</p>
          </div>
        ) : filteredScans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p>No scans found</p>
            <p className="text-sm">Create a new scan to get started</p>
          </div>
        ) : (
          <div className={cn(
            "grid gap-3",
            viewMode === "grid" ? "grid-cols-2" : "grid-cols-1"
          )}>
            {filteredScans.map((scan, index) => (
              <ScanCard
                key={scan.id}
                scan={scan}
                onClick={() => onSelectScan(scan)}
                index={index}
                onDelete={() => deleteMutation.mutate(scan.id)}
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
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
