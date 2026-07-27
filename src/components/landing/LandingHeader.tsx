// Sticky landing-page header: wordmark, EN/繁中 toggle, sign-in + trial CTAs.
import { Link } from "react-router-dom";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { landingCopy, type Lang } from "./copy";

interface LandingHeaderProps {
  lang: Lang;
  onToggleLang: () => void;
}

export function LandingHeader({ lang, onToggleLang }: LandingHeaderProps) {
  const copy = landingCopy[lang].header;

  return (
    <header className="glass sticky top-0 z-50 border-b border-border/50">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link to="/" className="text-lg font-bold tracking-tight sm:text-xl">
          <span className="text-gradient-green">CultraVista</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Same toggle pattern as ExhibitView: one button that flips locale. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleLang}
            aria-label="Switch language"
          >
            <Languages className="mr-1.5 h-4 w-4" />
            {lang === "en" ? "繁中" : "EN"}
          </Button>

          {/* "Sign in" is hidden on the smallest screens; the hero repeats it. */}
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/auth">{copy.signIn}</Link>
          </Button>

          <Button size="sm" asChild>
            <Link to="/auth?mode=signup">{copy.requestTrial}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
