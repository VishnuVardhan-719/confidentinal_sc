import type { AppLocale } from "@/i18n/routing";

/**
 * Public content read seam (stories + FAQ).
 *
 * The content module (`@/modules/content/public`, built on feat/fe2-e) is not on this branch yet.
 * This file mirrors its exact signatures and result type so pages are written against the real
 * contract. On integration, replace the three function bodies with:
 *
 *   export { getPublishedStories, getPublishedStory, getPublishedFaq } from "@/modules/content/public";
 *   export type { PublicContentResult } from "@/modules/content/public";
 *
 * Until then everything is "empty": no CMS exists and nothing is approved, so pages show their
 * honest empty states. Never add sample stories here.
 */
export type PublicContentResult<T> =
  | { status: "ok"; data: T; fixture: boolean }
  | { status: "empty"; fixture: boolean }
  | { status: "not_found" }
  | { status: "unavailable" };

// Structural copy of the module's approved rich-text subset (paragraph, heading 2/3, lists, bold/italic, safe links).
export type RichTextInline =
  | { type: "text"; text: string; marks?: ("bold" | "italic")[] }
  | { type: "link"; href: string; children: { type: "text"; text: string; marks?: ("bold" | "italic")[] }[] };
export type RichTextBlock =
  | { type: "paragraph"; children: RichTextInline[] }
  | { type: "heading"; level: 2 | 3; children: RichTextInline[] }
  | { type: "list"; style: "bullet" | "ordered"; items: RichTextInline[][] };
export type RichTextDoc = { type: "doc"; blocks: RichTextBlock[] };

export type PublicStory = {
  slug: string;
  /** Locale actually served; differs from the request only when falling back to en. */
  servedLocale: AppLocale;
  title: string;
  summary: string;
  body: RichTextDoc;
  publishedAt: string;
};
export type PublicStorySummary = Omit<PublicStory, "body">;
export type PublicFaqItem = { slug: string; servedLocale: AppLocale; question: string; answer: RichTextDoc; order: number };

export async function getPublishedStories(locale: AppLocale): Promise<PublicContentResult<PublicStorySummary[]>> {
  void locale;
  return { status: "empty", fixture: false };
}

export async function getPublishedStory(slug: string, locale: AppLocale): Promise<PublicContentResult<PublicStory>> {
  void slug;
  void locale;
  return { status: "not_found" };
}

export async function getPublishedFaq(locale: AppLocale): Promise<PublicContentResult<PublicFaqItem[]>> {
  void locale;
  return { status: "empty", fixture: false };
}
