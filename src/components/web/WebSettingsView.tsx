import { Moon, Sun, Info, LogOut } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";

// Settings kept intentionally minimal for the alpha: only controls that are
// actually wired to real behaviour. Decorative/mock rows (notifications,
// offline mode, subscription, storage, etc.) were removed rather than faked.
export function WebSettingsView() {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const isDark = theme === "dark";

  return (
    <div className="flex-1 overflow-y-auto py-8">
      <div className="max-w-2xl mx-auto px-8">
        <h1 className="text-2xl font-bold text-foreground mb-8">Settings</h1>

        {/* Signed-in account + sign out */}
        <div className="bg-card rounded-xl border border-border p-4 mb-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="text-foreground font-medium truncate">{user?.email ?? "—"}</p>
          </div>
          <Button variant="outline" className="gap-2 shrink-0" onClick={() => signOut()}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>

        {/* Preferences */}
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Preferences
        </h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-8">
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              {isDark ? (
                <Moon className="w-5 h-5 text-primary" />
              ) : (
                <Sun className="w-5 h-5 text-primary" />
              )}
            </div>
            <span className="flex-1 text-foreground font-medium">Dark Mode</span>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </div>

        {/* About */}
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          About
        </h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <Info className="w-5 h-5 text-primary" />
            </div>
            <span className="flex-1 text-foreground font-medium">CultraVista</span>
            <span className="text-sm text-muted-foreground">Alpha</span>
          </div>
        </div>
      </div>
    </div>
  );
}
