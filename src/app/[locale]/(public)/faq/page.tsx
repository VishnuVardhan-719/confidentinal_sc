import { getTranslations } from "next-intl/server";
import { FAQ_CATEGORIES, type FaqCategory, type FaqEntry } from "@/components/public/faq";
import { FaqSearch } from "@/components/public/faq-search";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";

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
      </Container>
    </>
  );
}
