import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedFaq } from "@/components/public/content-source";
import { FAQ_CATEGORIES, type FaqCategory, type FaqEntry } from "@/components/public/faq";
import { FaqSearch } from "@/components/public/faq-search";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { richTextToPlain } from "@/components/public/rich-text";
import { FixtureNotice } from "@/components/shared/fixture-notice";

export function generateMetadata() {
  return publicPageMetadata("faq", "/faq");
}

/**
 * Built-in answers are always shown; answers published through the CMS are added under "General"
 * when the content module serves them (fixture answers carry the synthetic-data notice).
 */
export default async function FaqPage() {
  const t = await getTranslations("public.faqPage");
  const tl = await getTranslations("public.landing.faq");
  const locale = await getLocale();
  const published = await getPublishedFaq(locale);

  const categories = Object.keys(FAQ_CATEGORIES) as FaqCategory[];
  const builtIn: FaqEntry[] = categories.flatMap((category) =>
    FAQ_CATEGORIES[category].map((id) => ({ id, category, q: t(`items.${id}.q`), a: t(`items.${id}.a`) })),
  );
  const cms: FaqEntry[] =
    published.status === "ok"
      ? [...published.data]
          .sort((a, b) => a.order - b.order)
          .map((item) => ({ id: `cms-${item.slug}`, category: "general", q: item.question, a: richTextToPlain(item.answer), answerDoc: item.answer }))
      : [];

  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")}>
        <ArrowLink href="/contact">{tl("contact")}</ArrowLink>
      </PublicPageIntro>
      <Container className="grid gap-6 pb-20">
        {published.status === "ok" && published.fixture ? <FixtureNotice /> : null}
        <FaqSearch
          entries={[...cms, ...builtIn]}
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
      </Container>
    </>
  );
}
