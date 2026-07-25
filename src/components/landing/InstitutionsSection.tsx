// "For museums & cultural institutions" pitch + mailto CTA. The mailto link
// stands in for a trial_requests table (schema changes are out of scope for
// PR7) — org/role details arrive by email instead.
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, landingCopy, type Lang } from "./copy";

export function InstitutionsSection({ lang }: { lang: Lang }) {
  const copy = landingCopy[lang].institutions;
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(copy.mailSubject)}`;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.heading}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{copy.body}</p>

      <ul className="mx-auto mt-8 flex max-w-md flex-col gap-3 text-left">
        {copy.points.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="text-sm sm:text-base">{point}</span>
          </li>
        ))}
      </ul>

      <Button size="lg" variant="outline" asChild className="mt-10">
        <a href={mailHref}>
          <Mail className="mr-2 h-4 w-4" />
          {copy.cta}
        </a>
      </Button>
    </section>
  );
}
