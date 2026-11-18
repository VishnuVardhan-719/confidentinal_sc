import { fail, type ApiResult } from "@/lib/api/result";
import type { ContentApi, PublicContentApi } from "./api";

/**
 * HTTP adapters for CMS content.
 *
 * No CMS or public content endpoint is documented in docs/API_CONTRACTS.md.
 * Every method returns `gated` until a contract is agreed (REQUESTS.md). The
 * public site must render its empty state, not invented stories or FAQs.
 */
const gated = async (): Promise<ApiResult<never>> => fail("gated");

export function createContentHttpApi(): ContentApi {
  return { mode: "http", listEntries: gated, getEntry: gated, saveDraft: gated, transition: gated, listRevisions: gated };
}

export function createPublicContentHttpApi(): PublicContentApi {
  return { mode: "http", listStories: gated, getStory: gated, listFaq: gated };
}
