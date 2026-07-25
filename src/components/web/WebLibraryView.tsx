import { useState } from "react";
import { Grid, List, Filter, SortAsc, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WebScanCard } from "./WebScanCard";
import { Scan } from "@/types/scan";
import { CaptureService, Capture, deliverySplatUrl } from "@/services/captureService";
import { cn } from "@/lib/utils";

// Convert database capture to Scan type
function captureToScan(capture: Capture): Scan {
  const folderPath = capture.folder_path || undefined;
  const splatUrl = deliverySplatUrl(capture);

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
    // PR2 archival metadata
    titleZhHant: capture.title_zh_hant,
    description: capture.description,
    descriptionZhHant: capture.description_zh_hant,
    captureDate: capture.capture_date,
    locationText: capture.location_text,
    lat: capture.lat,
    lng: capture.lng,
    rightsLicense: capture.rights_license,
    attribution: capture.attribution,
    tags: capture.tags,
    source: capture.source,
    location: capture.location_text || undefined,
    published: capture.published,
    slug: capture.slug,
    plyUrl: capture.ply_url,
    spzUrl: capture.spz_url,
  };
}

interface WebLibraryViewProps {
  onSelectScan: (scan: Scan) => void;
  searchQuery: string;
}

export function WebLibraryView({ onSelectScan, searchQuery }: WebLibraryViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-destructive">Failed to load scans</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {filteredScans.length} scans
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <SortAsc className="w-4 h-4" />
            Sort
          </Button>
          <div className="h-6 w-px bg-border mx-2" />
          <div className="flex items-center bg-secondary rounded-lg p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Grid/List */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        {filteredScans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p>No scans found</p>
            <p className="text-sm">Create a new scan to get started</p>
          </div>
        ) : (
          <div className={cn(
            "grid gap-5",
            viewMode === "grid" 
              ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" 
              : "grid-cols-1"
          )}>
            {filteredScans.map((scan, index) => (
              <WebScanCard
                key={scan.id}
                scan={scan}
                onClick={() => onSelectScan(scan)}
                viewMode={viewMode}
                index={index}
                onDelete={() => deleteMutation.mutate(scan.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
