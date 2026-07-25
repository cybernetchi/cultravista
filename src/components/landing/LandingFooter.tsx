// Landing footer: company, contact email, copyright, sign-in link.
import { Link } from "react-router-dom";
import { CONTACT_EMAIL, landingCopy, type Lang } from "./copy";

export function LandingFooter({ lang }: { lang: Lang }) {
  const copy = landingCopy[lang].footer;

  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {copy.company}
        </p>

        <div className="flex items-center gap-6">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="transition-colors hover:text-foreground"
          >
            {copy.contact}: {CONTACT_EMAIL}
          </a>
          <Link to="/auth" className="transition-colors hover:text-foreground">
            {copy.signIn}
          </Link>
        </div>
      </div>
    </footer>
  );
}
