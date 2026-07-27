// Static "how it works" strip: capture → curate → publish.
import { Camera, PenTool, Globe } from "lucide-react";
import { landingCopy, type Lang } from "./copy";

// Icons are positional: they pair with copy.how.steps by index.
const STEP_ICONS = [Camera, PenTool, Globe] as const;

export function HowItWorksSection({ lang }: { lang: Lang }) {
  const copy = landingCopy[lang].how;

  return (
    <section className="border-y border-border/50 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {copy.heading}
        </h2>

        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {copy.steps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? Camera;
            return (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-7 w-7" aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  <span className="mr-2 text-primary">{i + 1}.</span>
                  {step.title}
                </h3>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">{step.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
