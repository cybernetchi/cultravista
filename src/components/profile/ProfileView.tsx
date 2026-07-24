// Mobile profile — real session identity + capture count + sign-out.
// No fabricated stats: everything shown comes from AuthContext or the same
// captures query the Library uses.
import { LogOut, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CaptureService } from "@/services/captureService";

export function ProfileView() {
  const { user, signOut } = useAuth();

  // Reuse the shared captures cache to show a real count.
  const { data: captures, isLoading } = useQuery({
    queryKey: ["captures"],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) throw new Error(result.error || "Failed to fetch captures");
      return result.data || [];
    },
  });

  const email = user?.email ?? "—";
  // Prefer a provider-supplied display name; else the email local-part.
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  const captureCount = captures?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col pb-24 animate-fade-in">
      {/* Header */}
      <header className="px-5 pt-2 pb-6">
        <h1 className="text-3xl font-bold text-foreground">Profile</h1>
      </header>

      {/* Profile card */}
      <div className="px-5 mb-6">
        <div className="bg-card rounded-2xl p-6 flex flex-col items-center">
          {/* Avatar (initial) */}
          <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-4">
            <span className="text-3xl font-bold text-foreground">{initial}</span>
          </div>

          {/* Name + email */}
          <h2 className="text-xl font-bold text-foreground mb-1">{displayName}</h2>
          <p className="text-muted-foreground font-medium mb-6 truncate max-w-full">{email}</p>

          {/* Real stat: capture count */}
          <div className="flex w-full justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : captureCount}
              </p>
              <p className="text-sm text-muted-foreground">
                {captureCount === 1 ? "Capture" : "Captures"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className="px-5 mt-auto pt-6">
        <Button variant="outline" className="w-full h-12" onClick={() => signOut()}>
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
