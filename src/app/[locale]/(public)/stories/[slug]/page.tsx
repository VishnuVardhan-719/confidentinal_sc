import { getFormatter, getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { RichText } from "@/components/content/rich-text";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { getPublishedStory } from "@/components/public/stories-source";
import { FixtureNotice } from "@/components/shared/fixture-notice";

/** Only approved, published stories render; any other slug is not-found. */
export function generateStaticParams() {
  // Cache Components requires one sample param; it resolves to not-found like any unknown slug.
  return [{ slug: "__unpublished__" }];
}

export default async function StoryPage({ params }: PageProps<"/[locale]/stories/[slug]">) {
  const { slug } = await params;
  const locale = await getLocale();
  const story = await getPublishedStory(locale, slug);
  if (!story) notFound();
  const format = await getFormatter();

  return (
    <>
      <PublicPageIntro title={story.title} lead={story.summary}>
        <time dateTime={story.publishedAt} className="text-sm text-muted">
          {format.dateTime(new Date(story.publishedAt), { dateStyle: "long", timeZone: "Asia/Kolkata" })}
        </time>
      </PublicPageIntro>
      <Container className="pb-20">
        <div className="grid max-w-3xl gap-8">
          {story.fixture ? <FixtureNotice /> : null}
          <RichText doc={story.body} />
        </div>
      </Container>
    </>
  );
}
