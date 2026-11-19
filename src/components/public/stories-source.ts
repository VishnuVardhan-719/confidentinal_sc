import type { AppLocale } from "@/i18n/routing";
import { getPublishedStories, getPublishedStory as getPublishedContentStory } from "@/modules/content/public";
import type { RichTextDoc } from "@/modules/content/types";

/**
 * Published stories/articles for the public site, read from the content module
 * (src/modules/content/public.ts). Only published snapshots are returned; drafts and
 * previews never leave the CMS. The http adapter has no CMS contract yet, so it returns
 * nothing and the pages show their empty / not-found state. The fixture adapter
 * (synthetic data, refused in production) returns synthetic entries with `fixture: true`,
 * which the pages must mark with <FixtureNotice/>. Never add sample stories here.
 */
export type PublishedStory = {
  slug: string;
  title: string;
  summary: string;
  /** ISO date from the content source. */
  publishedAt: string;
  kind: "story" | "article";
};

export type PublishedStoryDetail = PublishedStory & { body: RichTextDoc; fixture: boolean };

export async function listPublishedStories(locale: AppLocale): Promise<{ stories: PublishedStory[]; fixture: boolean }> {
  const result = await getPublishedStories(locale);
  if (result.status !== "ok") return { stories: [], fixture: result.status === "empty" && result.fixture };
  return {
    stories: result.data.map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, publishedAt: s.publishedAt, kind: "story" as const })),
    fixture: result.fixture,
  };
}

export async function getPublishedStory(locale: AppLocale, slug: string): Promise<PublishedStoryDetail | null> {
  const result = await getPublishedContentStory(slug, locale);
  if (result.status !== "ok") return null;
  const s = result.data;
  return { slug: s.slug, title: s.title, summary: s.summary, publishedAt: s.publishedAt, kind: "story", body: s.body, fixture: result.fixture };
}
