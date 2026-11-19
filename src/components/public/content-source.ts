/**
 * Public content read seam (stories + FAQ), wired to the content module on integration.
 *
 * Only published snapshots leave the CMS. `fixture: true` means synthetic data (pages show
 * <FixtureNotice/>). The http adapter has no CMS contract yet and maps to "empty"/"not_found",
 * so pages show their honest empty states. Never add sample stories here.
 */
export { getPublishedFaq, getPublishedStories, getPublishedStory } from "@/modules/content/public";
export type { PublicContentResult } from "@/modules/content/public";
export type { RichTextBlock, RichTextDoc, RichTextInline } from "@/modules/content/schema";
export type { PublicFaqItem, PublicStory, PublicStorySummary } from "@/modules/content/types";
