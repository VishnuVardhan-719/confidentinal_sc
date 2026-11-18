import { useTranslations } from "next-intl";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { Notice } from "@/components/shared/notice";

export function generateMetadata() {
  return publicPageMetadata("ourStory", "/our-story");
}

export default function OurStoryPage() {
  const t = useTranslations("public.ourStory");
  const tc = useTranslations("common.footer.links");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-12 pb-20 lg:grid-cols-12">
        <section aria-labelledby="purpose" className="grid content-start gap-4 lg:col-span-7">
          <h2 id="purpose" className="font-display text-2xl font-medium text-ink">
            {t("purposeTitle")}
          </h2>
          <p className="measure text-lg leading-relaxed text-ink">{t("purposeBody")}</p>
        </section>
        <div className="grid content-start gap-6 lg:col-span-4 lg:col-start-9">
          <Notice tone="neutral" title={t("pendingTitle")}>
            {t("pendingBody")}
          </Notice>
          <ArrowLink href="/about">{tc("about")}</ArrowLink>
        </div>
      </Container>
    </>
  );
}
