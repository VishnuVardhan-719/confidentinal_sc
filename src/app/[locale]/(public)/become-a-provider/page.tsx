import { ArrowRight, FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { PROVIDER_ROLES, signupHref } from "@/components/public/routes";
import { ServiceIcon } from "@/components/shared/service-icon";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("becomeProvider", "/become-a-provider");
}

const ICONS = { doctor: "stethoscope", lab: "flask", ambulance: "ambulance", caretaker: "care" } as const;
const NEED = ["identity", "registration", "coverage", "pricing"] as const;

export default function BecomeProviderPage() {
  const t = useTranslations("public.becomeProvider");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-16 pb-20">
        <section aria-labelledby="roles">
          <h2 id="roles" className="font-display text-2xl font-medium text-ink">
            {t("rolesTitle")}
          </h2>
          <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            {PROVIDER_ROLES.map((role) => (
              <li key={role} className="bg-surface">
                <Link href={signupHref(role)} className="group grid h-full gap-3 p-6 hover:bg-mist sm:p-8">
                  <ServiceIcon name={ICONS[role]} className="size-7 text-forest" />
                  <span className="font-display text-2xl text-ink">{t(`roles.${role}.title`)}</span>
                  <span className="text-base text-muted">{t(`roles.${role}.body`)}</span>
                  <span className="mt-2 inline-flex items-center gap-2 font-semibold text-forest">
                    {t(`roles.${role}.cta`)}
                    <ArrowRight aria-hidden className="size-4.5 transition-transform duration-(--scv-duration-fast) group-hover:translate-x-1" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-12 lg:grid-cols-12">
          <section aria-labelledby="need" className="grid content-start gap-4 lg:col-span-6">
            <h2 id="need" className="font-display text-2xl font-medium text-ink">
              {t("needTitle")}
            </h2>
            <ul className="grid gap-3">
              {NEED.map((k) => (
                <li key={k} className="flex gap-3 text-lg text-ink">
                  <FileCheck2 aria-hidden className="mt-1 size-5 shrink-0 text-forest" />
                  {t(`need.${k}`)}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="review" className="grid content-start gap-4 lg:col-span-5 lg:col-start-8">
            <h2 id="review" className="font-display text-2xl font-medium text-ink">
              {t("reviewTitle")}
            </h2>
            <p className="text-lg text-muted">{t("reviewBody")}</p>
          </section>
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-8 text-lg text-ink">
          {t("patientNote")}
          <ArrowLink href={signupHref("patient")}>{t("patientCta")}</ArrowLink>
        </p>
      </Container>
    </>
  );
}
