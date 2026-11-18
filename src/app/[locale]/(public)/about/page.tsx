import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("about", "/about");
}

const MODEL = ["independent", "choice", "acceptance", "verified"] as const;
const NOT = ["emergency", "employer", "ai"] as const;

export default function AboutPage() {
  const t = useTranslations("public.about");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-16 pb-20">
        <section aria-labelledby="mission" className="grid gap-6 border-t border-border pt-10 lg:grid-cols-12">
          <h2 id="mission" className="font-display text-2xl font-medium text-ink lg:col-span-4">
            {t("missionTitle")}
          </h2>
          <p className="measure font-display text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-[1.45] text-ink lg:col-span-7 lg:col-start-6">
            {t("missionBody")}
          </p>
        </section>

        <section aria-labelledby="model" className="grid gap-6 border-t border-border pt-10 lg:grid-cols-12">
          <h2 id="model" className="font-display text-2xl font-medium text-ink lg:col-span-4">
            {t("modelTitle")}
          </h2>
          <ul className="grid gap-4 lg:col-span-7 lg:col-start-6">
            {MODEL.map((k) => (
              <li key={k} className="flex gap-3 text-lg text-ink">
                <Check aria-hidden className="mt-1.5 size-5 shrink-0 text-success" strokeWidth={2.5} />
                {t(`model.${k}`)}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="not" className="grid gap-6 border-t border-border pt-10 lg:grid-cols-12">
          <h2 id="not" className="font-display text-2xl font-medium text-ink lg:col-span-4">
            {t("notTitle")}
          </h2>
          <ul className="grid gap-4 lg:col-span-7 lg:col-start-6">
            {NOT.map((k) => (
              <li key={k} className="flex gap-3 text-lg text-ink">
                <X aria-hidden className="mt-1.5 size-5 shrink-0 text-muted" strokeWidth={2.5} />
                {t(`not.${k}`)}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="team" className="grid gap-6 border-t border-border pt-10 lg:grid-cols-12">
          <h2 id="team" className="font-display text-2xl font-medium text-ink lg:col-span-4">
            {t("teamTitle")}
          </h2>
          <div className="grid gap-6 lg:col-span-7 lg:col-start-6">
            <p className="measure text-lg text-muted">{t("teamBody")}</p>
            <ArrowLink href="/our-story">{t("storyCta")}</ArrowLink>
          </div>
        </section>
      </Container>
    </>
  );
}
