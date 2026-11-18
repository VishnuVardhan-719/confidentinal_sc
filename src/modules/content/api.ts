import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type {
  ContentEntry,
  ContentListFilter,
  ContentRevision,
  ContentTransitionInput,
  Locale,
  Page,
  PublicFaqItem,
  PublicStory,
  PublicStorySummary,
} from "./types";

/** Admin CMS API (content:edit / content:publish capabilities). */
export interface ContentApi {
  readonly mode: AdapterMode;
  listEntries(filter?: ContentListFilter): Promise<ApiResult<Page<ContentEntry>>>;
  getEntry(entryId: string): Promise<ApiResult<ContentEntry>>;
  /** Input is untrusted; validated by contentDraftSchema (no HTML/script, no extra fields). */
  saveDraft(input: { entryId: string | null; draft: unknown; expectedVersion: number | null; idempotencyKey: string }): Promise<ApiResult<ContentEntry>>;
  transition(input: ContentTransitionInput): Promise<ApiResult<ContentEntry>>;
  listRevisions(input: { entryId: string; locale: Locale }): Promise<ApiResult<ContentRevision[]>>;
}

/** Public read model for the public site: published snapshots only. */
export interface PublicContentApi {
  readonly mode: AdapterMode;
  listStories(locale: Locale): Promise<ApiResult<PublicStorySummary[]>>;
  getStory(slug: string, locale: Locale): Promise<ApiResult<PublicStory>>;
  listFaq(locale: Locale): Promise<ApiResult<PublicFaqItem[]>>;
}
