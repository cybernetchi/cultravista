// Landing hero: what CultraVista is + primary/secondary CTAs.
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { landingCopy, type Lang } from "./copy";

export function HeroSection({ lang }: { lang: Lang }) {
  const copy = landingCopy[lang].hero;

  return (
    <section className="relative overflow-hidden">
      {/* Soft green glow behind the headline; decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="animate-fade-in text-sm font-medium uppercase tracking-widest text-primary">
          {copy.tagline}
        </p>

        <h1 className="mt-4 animate-fade-up text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          {copy.title}
        </h1>

        <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-base text-muted-foreground sm:text-lg">
          {copy.subtitle}
        </p>

        {/* CTAs stack on phones, sit side-by-side from sm up. */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild className="w-full glow-green sm:w-auto">
            <Link to="/auth?mode=signup">
              {copy.ctaPrimary}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
            <Link to="/auth">{copy.ctaSecondary}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
