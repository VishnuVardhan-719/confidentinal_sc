import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getPublishedStory } from "@/components/public/content-source";
import { ArrowLink, Container } from "@/components/public/layout";
import { RichText } from "@/components/public/rich-text";
import { pageMetadata } from "@/components/public/seo";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";

/** Cache Components requires one sample param; it resolves to not-found like any unpublished slug. */
export function generateStaticParams() {
  return [{ slug: "__unpublished__" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/stories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const result = await getPublishedStory(slug, locale);
  if (result.status !== "ok") return { robots: { index: false } };
  return pageMetadata({ locale, path: `/stories/${slug}`, title: result.data.title, description: result.data.summary, noindex: result.fixture });
}

/** Only approved, published stories render; drafts and unknown slugs are not-found. */
export default async function StoryPage({ params }: PageProps<"/[locale]/stories/[slug]">) {
  const { slug } = await params;
  const locale = await getLocale();
  const result = await getPublishedStory(slug, locale);
  if (result.status === "not_found" || result.status === "empty") notFound();

  const t = await getTranslations("public.storyPage");
  if (result.status === "unavailable") {
    return (
      <Container className="grid gap-6 py-16">
        <InlineError code="unavailable" />
        <ArrowLink href="/stories">{t("back")}</ArrowLink>
      </Container>
    );
  }

  const format = await getFormatter();
  const story = result.data;
  return (
    <Container className="grid gap-8 py-12 md:py-20">
      <ArrowLink href="/stories">{t("back")}</ArrowLink>
      {result.fixture ? <FixtureNotice /> : null}
      <article className="grid gap-6">
        <header className="grid gap-3">
          <h1 lang={story.servedLocale} className="max-w-4xl font-display text-[clamp(2rem,1.5rem+2vw,3.25rem)] leading-[1.1] font-medium tracking-[-0.025em] text-ink">
            {story.title}
          </h1>
          <p lang={story.servedLocale} className="measure text-xl text-muted">{story.summary}</p>
          <p className="text-sm text-muted">
            <time dateTime={story.publishedAt}>
              {t("published", { date: format.dateTime(new Date(story.publishedAt), { dateStyle: "long", timeZone: "Asia/Kolkata" }) })}
            </time>
          </p>
          {story.servedLocale !== locale ? <p className="text-sm text-muted">{t("fallbackLanguage")}</p> : null}
        </header>
        {/* Only the story content carries the served language; UI text stays in the page locale. */}
        <div lang={story.servedLocale}>
          <RichText doc={story.body} />
        </div>
        <p className="text-sm text-muted">{t("disclaimer")}</p>
      </article>
    </Container>
  );
}
