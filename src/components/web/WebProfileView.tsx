import { useQuery } from "@tanstack/react-query";
import { Grid, Loader2 } from "lucide-react";
import { Scan } from "@/types/scan";
import { CaptureService, Capture, captureToScan, viewerIdentity } from "@/services/captureService";
import { useAuth } from "@/contexts/AuthContext";
import { WebScanCard } from "./WebScanCard";

interface WebProfileViewProps {
  onSelectScan: (scan: Scan) => void;
}

// The user's profile: real identity (from auth) and their real captures.
// Social features (followers, stars, view counts) are intentionally omitted —
// there's no backend for them yet, so we don't fake them.
export function WebProfileView({ onSelectScan }: WebProfileViewProps) {
  const { user } = useAuth();

  const { data: captures, isLoading, error } = useQuery({
    queryKey: ["captures"],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) throw new Error(result.error || "Failed to fetch captures");
      return result.data || [];
    },
  });

  const viewer = viewerIdentity(user);
  const scans = (captures || []).map((c) => captureToScan(c, viewer));

  // Derive display name + initial from the auth identity.
  const email = user?.email ?? "";
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (email ? email.split("@")[0] : "Your profile");
  const handle = email ? `@${email.split("@")[0]}` : "";
  const initial = (displayName[0] || "?").toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Cover */}
      <div className="h-48 bg-gradient-to-br from-primary/20 via-background to-primary/5" />

      {/* Profile header */}
      <div className="max-w-4xl mx-auto px-8 -mt-16 relative z-10">
        <div className="flex items-end gap-6">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center border-4 border-background shadow-xl">
            <span className="text-primary-foreground font-bold text-4xl">{initial}</span>
          </div>

          {/* Info */}
          <div className="flex-1 pb-2">
            <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
            {handle && <p className="text-muted-foreground">{handle}</p>}
          </div>
        </div>

        {/* Stats — only what we can truthfully count. */}
        <div className="flex gap-8 mt-6 py-6 border-y border-border">
          <div>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : scans.length}
            </div>
            <div className="text-sm text-muted-foreground">Scans</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : scans.filter((s) => s.published).length}
            </div>
            <div className="text-sm text-muted-foreground">Published</div>
          </div>
        </div>

        {/* Tab (single, real one for now) */}
        <div className="flex gap-6 mt-6">
          <div className="flex items-center gap-2 pb-3 border-b-2 border-primary text-primary font-medium">
            <Grid className="w-4 h-4" />
            My Scans
          </div>
        </div>

        {/* Real scans grid */}
        <div className="mt-6 pb-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive py-8">Failed to load your scans.</p>
          ) : scans.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <p>No scans yet</p>
              <p className="text-sm">Create a capture to see it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {scans.map((scan, index) => (
                <WebScanCard
                  key={scan.id}
                  scan={scan}
                  onClick={() => onSelectScan(scan)}
                  viewMode="grid"
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
