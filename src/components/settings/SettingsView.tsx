// Mobile settings — trimmed to what actually works in the alpha. The previous
// screen showed fake toggles (notifications, offline, storage usage) that did
// nothing; per the "don't ship a fake feature" rule those are removed. What
// remains is real: the signed-in account + sign-out, and app info.
import { LogOut, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function SettingsView() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex-1 flex flex-col pb-24 animate-fade-in">
      {/* Header */}
      <header className="px-5 pt-2 pb-6">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      </header>

      {/* Account */}
      <div className="px-5 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="bg-card rounded-2xl p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="font-medium text-foreground truncate">{user?.email ?? "—"}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => signOut()}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* About */}
      <div className="px-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          About
        </h2>
        <div className="bg-card rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <Info className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">CultraVista</p>
            <p className="text-sm text-muted-foreground">Alpha · v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted-foreground/60">© 2026 Space and Place Limited</p>
      </div>
    </div>
  );
}
