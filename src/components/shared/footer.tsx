import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { SERVICES } from "@/components/public/routes";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { LocaleSwitcher } from "./locale-switcher";

const COLUMNS = [
  {
    key: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "ourStory", href: "/our-story" },
      { key: "stories", href: "/stories" },
      { key: "howItWorks", href: "/how-it-works" },
      { key: "memberships", href: "/memberships" },
    ],
  },
  {
    key: "help",
    links: [
      { key: "faq", href: "/faq" },
      { key: "contact", href: "/contact" },
      { key: "emergencyGuidance", href: "/emergency" },
      { key: "becomeProvider", href: "/become-a-provider" },
    ],
  },
  {
    key: "account",
    links: [
      { key: "signIn", href: "/login" },
      { key: "createAccount", href: "/signup" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
      { key: "refunds", href: "/refunds" },
    ],
  },
] as const;

const linkClass = "inline-flex min-h-target items-center text-base text-on-forest-muted underline-offset-4 hover:text-on-forest hover:underline focus-visible:outline-paper";

/** Only working public pages are linked. Legal pages are labelled as drafts until approved. */
export function Footer() {
  const t = useTranslations("common");
  const ta = useTranslations("accessibility");
  return (
    <footer className="mt-auto bg-forest-strong text-on-forest">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-10 sm:gap-12 sm:px-6 sm:py-14 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div className="grid content-start gap-5">
          <BrandLogo tone="paper" className="focus-visible:outline-paper [&_rect]:fill-paper [&_path]:text-forest [&_circle]:fill-forest" />
          <p className="max-w-sm text-base text-on-forest-muted">{t("footer.tagline")}</p>
          <Link
            href="/emergency"
            className="inline-flex min-h-target w-fit items-center gap-2 rounded-md bg-paper px-4 font-semibold text-danger focus-visible:outline-paper"
          >
            <Phone aria-hidden className="size-4.5" />
            {t("footer.emergency")}
          </Link>
        </div>
        <nav aria-label={ta("footerNavigation")} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">
          <div className="grid content-start gap-3">
            <h2 className="text-sm font-semibold text-on-forest">{t("footer.columns.services")}</h2>
            <ul className="grid gap-0.5">
              {SERVICES.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className={linkClass}>
                    {t(`services.${s.key}.label`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.key} className="grid content-start gap-3">
              <h2 className="text-sm font-semibold text-on-forest">{t(`footer.columns.${col.key}`)}</h2>
              <ul className="grid gap-0.5">
                {col.links.map((l) => (
                  <li key={l.key}>
                    <Link href={l.href} className={linkClass}>
                      {t(`footer.links.${l.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-on-forest/15">
        <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="text-sm text-on-forest-muted">{t("footer.identity")}</p>
          <div className="[&_a]:text-on-forest-muted [&_a]:hover:text-on-forest [&_a[aria-current]]:text-on-forest [&_a]:focus-visible:outline-paper">
            <LocaleSwitcher variant="inline" />
          </div>
        </div>
      </div>
    </footer>
  );
}
