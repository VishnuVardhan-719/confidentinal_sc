import type { AppLocale } from "@/i18n/routing";

/**
 * Published stories/articles. There is no approved CMS or content module yet
 * (docs/frontend/REQUESTS.md), and nothing has been approved for publication, so both functions
 * return no content. Never add sample stories here: fabricated testimonials are prohibited.
 */
export type PublishedStory = {
  slug: string;
  title: string;
  summary: string;
  /** ISO date from the content source. */
  publishedAt: string;
  kind: "story" | "article";
};

export async function listPublishedStories(locale: AppLocale): Promise<PublishedStory[]> {
  void locale;
  return [];
}

export async function getPublishedStory(locale: AppLocale, slug: string): Promise<PublishedStory | null> {
  void locale;
  void slug;
  return null;
}
