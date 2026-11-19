import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RichText } from "@/components/content/rich-text";
import { FAQ_CATEGORIES, type FaqCategory, type FaqEntry } from "@/components/public/faq";
import { FaqSearch } from "@/components/public/faq-search";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { getPublishedFaq } from "@/modules/content/public";

export function generateMetadata() {
  return publicPageMetadata("faq", "/faq");
}

export default async function FaqPage() {
  const t = await getTranslations("public.faqPage");
  const tl = await getTranslations("public.landing.faq");
  const categories = Object.keys(FAQ_CATEGORIES) as FaqCategory[];
  const entries: FaqEntry[] = categories.flatMap((category) =>
    FAQ_CATEGORIES[category].map((id) => ({ id, category, q: t(`items.${id}.q`), a: t(`items.${id}.a`) })),
  );

  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")}>
        <ArrowLink href="/contact">{tl("contact")}</ArrowLink>
      </PublicPageIntro>
      <Container className="pb-20">
        <FaqSearch
          entries={entries}
          labels={{
            searchLabel: t("searchLabel"),
            searchHint: t("searchHint"),
            results: { zero: t("resultsZero"), one: t("resultsOne"), other: t("resultsOther") },
            noResultsTitle: t("noResultsTitle"),
            noResultsBody: t("noResultsBody"),
            clear: t("clear"),
            categories: Object.fromEntries(categories.map((c) => [c, t(`categories.${c}`)])) as Record<FaqCategory, string>,
          }}
        />
        <Suspense fallback={null}>
          <PublishedFaq />
        </Suspense>
      </Container>
    </>
  );
}

/** FAQ entries published through the CMS. Read per request because publishing can happen at any time. */
async function PublishedFaq() {
  await connection();
  const result = await getPublishedFaq(await getLocale());
  if (result.status !== "ok") return null;
  const t = await getTranslations("public.faqPage");
  return (
    <section aria-labelledby="faq-published" className="mt-12 grid max-w-3xl gap-6">
      <h2 id="faq-published" className="font-display text-2xl text-ink">
        {t("publishedTitle")}
      </h2>
      {result.fixture ? <FixtureNotice /> : null}
      <div className="grid divide-y divide-border border-y border-border">
        {result.data.map((item) => (
          <article key={item.slug} className="grid gap-3 py-5">
            <h3 className="text-lg font-semibold text-ink">{item.question}</h3>
            <RichText doc={item.answer} />
          </article>
        ))}
      </div>
    </section>
  );
}
