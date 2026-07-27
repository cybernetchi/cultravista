// Public landing page (PR7). Anonymous visitors see the marketing page;
// signed-in users are redirected straight to the app at /app.
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { LiveDemoSection } from "@/components/landing/LiveDemoSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { InstitutionsSection } from "@/components/landing/InstitutionsSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import type { Lang } from "@/components/landing/copy";

export default function Landing() {
  const { session, loading } = useAuth();

  // EN/繁中 toggle for the landing copy — same local-state pattern as ExhibitView.
  const [lang, setLang] = useState<Lang>("en");
  const toggleLang = () => setLang((l) => (l === "en" ? "zh" : "en"));

  // While the session hydrates, show the same spinner as ProtectedRoute so
  // signed-in users never see a flash of marketing content.
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Existing users still land in the app when they open "/".
  if (session) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader lang={lang} onToggleLang={toggleLang} />
      <main>
        <HeroSection lang={lang} />
        <LiveDemoSection lang={lang} />
        <HowItWorksSection lang={lang} />
        <InstitutionsSection lang={lang} />
      </main>
      <LandingFooter lang={lang} />
    </div>
  );
}
