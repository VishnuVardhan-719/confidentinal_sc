import type { AppLocale } from "@/i18n/routing";
import { getPublishedStories, getPublishedStory as getPublishedContentStory } from "@/modules/content/public";
import type { RichTextDoc } from "@/modules/content/types";

/**
 * Published stories/articles for the public site, read from the content module
 * (src/modules/content/public.ts). Only published snapshots are returned; drafts and
 * previews never leave the CMS. The http adapter has no CMS contract yet, so it reports
 * `gated` and the pages show a "not available yet" state (HTTP 200, not a 404). The fixture
 * adapter (synthetic data, refused in production) returns synthetic entries with `fixture: true`,
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

/**
 * `gated`: no CMS contract yet. `unavailable`: the content backend failed; the page shows an error
 * with "Try again", never "no stories yet" (an error must not look like an empty list).
 */
export async function listPublishedStories(
  locale: AppLocale,
): Promise<{ stories: PublishedStory[]; fixture: boolean; gated: boolean; unavailable: boolean }> {
  const result = await getPublishedStories(locale);
  if (result.status !== "ok") {
    return {
      stories: [],
      fixture: result.status === "empty" && result.fixture,
      gated: result.status === "gated",
      unavailable: result.status === "unavailable" || result.status === "not_found",
    };
  }
  return {
    stories: result.data.map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, publishedAt: s.publishedAt, kind: "story" as const })),
    fixture: result.fixture,
    gated: false,
    unavailable: false,
  };
}

export type StoryLookup = { kind: "ok"; story: PublishedStoryDetail } | { kind: "gated" } | { kind: "not_found" } | { kind: "unavailable" };

/**
 * `gated`: stories are not switched on for this backend yet. `not_found`: not published.
 * `unavailable`: the content backend failed, which is not a 404 (the page throws to its error boundary).
 */
export async function getPublishedStory(locale: AppLocale, slug: string): Promise<StoryLookup> {
  const result = await getPublishedContentStory(slug, locale);
  if (result.status === "gated") return { kind: "gated" };
  if (result.status === "unavailable") return { kind: "unavailable" };
  if (result.status !== "ok") return { kind: "not_found" };
  const s = result.data;
  return {
    kind: "ok",
    story: { slug: s.slug, title: s.title, summary: s.summary, publishedAt: s.publishedAt, kind: "story", body: s.body, fixture: result.fixture },
  };
}
