// Live demo: embeds up to two *published* exhibits via the public
// /iframe-viewer?slug=… path (same snippet shape museums get from the share
// dialog). Reads through the PR4 anon RLS policy only — no auth involved.
//
// States: loading → skeletons; ready → iframes; empty/error → placeholder card.
// A fetch error is logged but rendered as the placeholder: a marketing page
// should degrade quietly, never show a raw error string.
import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import {
  CaptureService,
  type PublishedCaptureSummary,
} from "@/services/captureService";
import { landingCopy, type Lang } from "./copy";

type DemoStatus = "loading" | "ready" | "empty";

export function LiveDemoSection({ lang }: { lang: Lang }) {
  const copy = landingCopy[lang].demo;
  const [status, setStatus] = useState<DemoStatus>("loading");
  const [captures, setCaptures] = useState<PublishedCaptureSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    CaptureService.getPublishedCaptures(2).then((res) => {
      if (cancelled) return;
      if (res.success && res.data && res.data.length > 0) {
        setCaptures(res.data);
        setStatus("ready");
      } else {
        if (!res.success) {
          console.error("Landing demo: failed to load published exhibits:", res.error);
        }
        setStatus("empty");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Bilingual field fallback (zh → en), same pattern as ExhibitView.
  const localized = (en: string | null, zh: string | null) =>
    lang === "zh" && zh ? zh : en;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        {copy.heading}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
        {copy.subheading}
      </p>

      <div className="mt-10">
        {status === "loading" && (
          /* Skeletons at the iframe's aspect so the layout doesn't jump. */
          <div className="grid gap-8 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[420px] w-full animate-pulse rounded-xl bg-muted/40 md:h-[520px]"
              />
            ))}
          </div>
        )}

        {status === "ready" && (
          <div
            className={`grid gap-8 ${captures.length > 1 ? "md:grid-cols-2" : "mx-auto max-w-3xl"}`}
          >
            {captures.map((capture) => (
              <figure key={capture.id} className="space-y-3">
                {/* Exact embed shape from the app's share dialog. */}
                <iframe
                  src={`${window.location.origin}/iframe-viewer?slug=${capture.slug}`}
                  title={capture.title}
                  loading="lazy"
                  allow="accelerometer; gyroscope; magnetometer"
                  className="h-[420px] w-full rounded-xl border-0 bg-black md:h-[520px]"
                />
                <figcaption>
                  <p className="font-semibold">
                    {localized(capture.title, capture.title_zh_hant)}
                  </p>
                  {(capture.description || capture.description_zh_hant) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {localized(capture.description, capture.description_zh_hant)}
                    </p>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {status === "empty" && (
          /* No published exhibits yet (or fetch failed) — quiet placeholder.
             The section self-activates once any capture is published. */
          <div className="glass mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-xl px-6 py-14 text-center">
            <Landmark className="h-10 w-10 text-primary" aria-hidden />
            <p className="text-lg font-semibold">{copy.placeholderTitle}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {copy.placeholderBody}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
