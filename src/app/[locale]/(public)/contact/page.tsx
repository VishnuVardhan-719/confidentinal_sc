import { ArrowRight, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { Notice } from "@/components/shared/notice";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("contact", "/contact");
}

const ROUTES = [
  { key: "emergency", href: "/emergency" },
  { key: "faq", href: "/faq" },
  { key: "how", href: "/how-it-works" },
  { key: "providers", href: "/become-a-provider" },
] as const;

/**
 * No contact form: there is no approved support endpoint or staffed channel yet, and a form that
 * goes nowhere would be a fake CTA. No health-detail fields will ever be added here.
 */
export default function ContactPage() {
  const t = useTranslations("public.contact");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-12 pb-20 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-5">
          <Notice tone="neutral" title={t("pendingTitle")}>
            {t("pendingBody")}
          </Notice>
          <p className="flex gap-3 text-base text-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
            {t("privacyNote")}
          </p>
        </div>
        <section aria-labelledby="routes" className="lg:col-span-6 lg:col-start-7">
          <h2 id="routes" className="font-display text-2xl font-medium text-ink">
            {t("routesTitle")}
          </h2>
          <ul className="mt-4 grid divide-y divide-border border-y border-border">
            {ROUTES.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="group flex min-h-20 items-center gap-4 py-4">
                  <span className="grid flex-1">
                    <span className={r.key === "emergency" ? "text-lg font-semibold text-danger" : "text-lg font-semibold text-ink group-hover:text-forest"}>
                      {t(`routes.${r.key}.title`)}
                    </span>
                    <span className="text-base text-muted">{t(`routes.${r.key}.body`)}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-5 shrink-0 text-forest transition-transform duration-(--scv-duration-fast) group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}
