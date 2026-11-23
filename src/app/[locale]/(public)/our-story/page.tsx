import { useTranslations } from "next-intl";
import { BrandLockup } from "@/components/shared/brand-logo";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { LeaderLetter } from "@/components/public/leader-letter";
import { LEADERS, SHARED_PROMISE } from "@/components/public/leadership";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("ourStory", "/our-story");
}

export default function OurStoryPage() {
  const t = useTranslations("public.ourStory");
  const tc = useTranslations("common.footer.links");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-14 pb-20">
        <section aria-labelledby="purpose" className="grid gap-4 lg:grid-cols-12">
          <h2 id="purpose" className="font-display text-2xl font-medium text-ink lg:col-span-4">
            {t("purposeTitle")}
          </h2>
          <div className="grid content-start gap-8 lg:col-span-8 lg:col-start-5 lg:grid-cols-[1fr_16rem]">
            <p className="measure text-lg leading-relaxed text-ink">{t("purposeBody")}</p>
            <BrandLockup className="max-w-64 rounded-lg border border-border bg-white" priority />
          </div>
        </section>

        <div className="grid gap-2">
          <h2 className="font-display text-3xl font-medium text-ink">{t("leadersTitle")}</h2>
          <p className="text-base text-muted">{t("englishNote")}</p>
        </div>

        {LEADERS.map((leader) => (
          <LeaderLetter key={leader.id} leader={leader} />
        ))}

        <section aria-labelledby="promise" className="grid gap-5 rounded-lg bg-forest-strong p-6 text-on-forest sm:p-10" lang="en">
          <h2 id="promise" className="font-display text-[clamp(1.6rem,1.3rem+1.2vw,2.25rem)] leading-[1.15] font-medium">
            <span className="block text-base font-semibold text-on-forest-muted">{t("promiseTitle")}</span>
            {SHARED_PROMISE.title}
          </h2>
          <div className="measure grid gap-3 text-lg leading-relaxed text-on-forest">
            {SHARED_PROMISE.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <p className="font-semibold">{SHARED_PROMISE.tagline}</p>
        </section>

        <ArrowLink href="/about">{tc("about")}</ArrowLink>
      </Container>
    </>
  );
}
