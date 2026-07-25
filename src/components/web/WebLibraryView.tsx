import { useState } from "react";
import { Grid, List, Filter, SortAsc, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";
import { WebScanCard } from "./WebScanCard";
import { Scan } from "@/types/scan";
import { CaptureService, Capture, captureToScan, viewerIdentity } from "@/services/captureService";
import { useAuth } from "@/contexts/AuthContext";
import { useResumeStalledKiri } from "@/hooks/useCapture";
import { cn } from "@/lib/utils";

interface WebLibraryViewProps {
  onSelectScan: (scan: Scan) => void;
  searchQuery: string;
}

export function WebLibraryView({ onSelectScan, searchQuery }: WebLibraryViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Failed scans can't open the detail panel, so deletion happens from the
  // card itself via this confirm dialog.
  const [scanToDelete, setScanToDelete] = useState<Scan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const handleConfirmDelete = async () => {
    if (!scanToDelete) return;
    setDeleteBusy(true);
    const res = await CaptureService.deleteCapture(scanToDelete.id);
    setDeleteBusy(false);
    if (!res.success) {
      toast.error(res.error || "Failed to delete scan");
      return;
    }
    setScanToDelete(null);
    queryClient.invalidateQueries({ queryKey: ["captures"] });
    toast.success("Scan deleted");
  };

  const { data: captures, isLoading, error } = useQuery({
    queryKey: ['captures'],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch captures');
      }
      return result.data || [];
    },
    // Poll every 5 seconds if there are any processing items. Direct .splat
    // uploads (PR8) never get a folder_path — `file` alone marks them done.
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasProcessing = data?.some((c: Capture) => c.status === 0 || (c.status === 1 && !c.folder_path && !c.file));
      return hasProcessing ? 5000 : false;
    },
  });

  // Rescue KIRI captures whose client-driven pipeline was interrupted
  // (create modal closed mid-run) — otherwise they show "Processing" forever.
  useResumeStalledKiri(captures);

  const viewer = viewerIdentity(user);
  const scans = captures?.map((c) => captureToScan(c, viewer)) || [];

  const filteredScans = scans.filter(scan =>
    scan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (scan.authorHandle && scan.authorHandle.toLowerCase().includes(searchQuery.toLowerCase()))
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
                onDelete={() => setScanToDelete(scan)}
                viewMode={viewMode}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation (failed scans are deleted straight from the card). */}
      <AlertDialog open={!!scanToDelete} onOpenChange={(open) => !open && setScanToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scan?</AlertDialogTitle>
            <AlertDialogDescription>
              "{scanToDelete?.title}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open while the request is in flight.
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
