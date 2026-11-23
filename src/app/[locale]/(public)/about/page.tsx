import { Check, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { LEADERS } from "@/components/public/leadership";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("about", "/about");
}

const MODEL = ["independent", "choice", "acceptance", "verified"] as const;
const NOT = ["emergency", "employer", "ai"] as const;

export default function AboutPage() {
  const t = useTranslations("public.about");
  const tOur = useTranslations("public.ourStory");
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
            <ul className="grid gap-5 sm:grid-cols-3">
              {LEADERS.map((leader) => (
                <li key={leader.id} className="grid grid-cols-[5.5rem_1fr] items-center gap-4 sm:grid-cols-1 sm:content-start sm:items-start sm:gap-3">
                  <Image
                    src={leader.photo}
                    alt={tOur("portraitAlt", { name: leader.name })}
                    width={leader.photoWidth}
                    height={leader.photoHeight}
                    unoptimized
                    className="aspect-[4/5] w-full rounded-lg border border-border bg-mist object-cover object-top"
                  />
                  <div lang="en">
                    <p className="font-display text-lg leading-tight font-medium text-ink">{leader.name}</p>
                    <p className="mt-1 text-base text-muted">{leader.role}</p>
                  </div>
                </li>
              ))}
            </ul>
            <ArrowLink href="/our-story">{t("storyCta")}</ArrowLink>
          </div>
        </section>
      </Container>
    </>
  );
}
