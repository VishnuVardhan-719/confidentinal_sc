import type { ApiResult } from "@/lib/api/result";
import { getPublicContentApi } from "./index";
import type { Locale } from "./schema";
import type { PublicFaqItem, PublicStory, PublicStorySummary } from "./types";

/**
 * Server helper for the PUBLIC site (stories, FAQ). Import from server
 * components only:
 *
 *   import { getPublishedStories, getPublishedStory, getPublishedFaq } from "@/modules/content/public";
 *
 * - Returns published snapshots only; drafts and previews never leave the CMS.
 * - `fixture: true` means synthetic data: render <FixtureNotice/>.
 * - No CMS contract exists yet, so the http adapter is `gated`. Stories report
 *   `gated` (list and detail render a "not available yet" state, never a 404 or
 *   invented copy); the FAQ maps `gated` to `empty`.
 * - Rich text is structured nodes; render them with React elements, never as HTML.
 */
export type PublicContentResult<T> =
  | { status: "ok"; data: T; fixture: boolean }
  | { status: "empty"; fixture: boolean }
  | { status: "not_found" }
  | { status: "gated" }
  | { status: "unavailable" };

type Env = Record<string, string | undefined>;

function toPublic<T>(result: ApiResult<T>, fixture: boolean, isEmpty: (data: T) => boolean, gatedAs: "gated" | "empty" = "empty"): PublicContentResult<T> {
  if (result.ok) return isEmpty(result.data) ? { status: "empty", fixture } : { status: "ok", data: result.data, fixture };
  if (result.error.code === "gated") return gatedAs === "gated" ? { status: "gated" } : { status: "empty", fixture };
  if (result.error.code === "not_found") return { status: "not_found" };
  return { status: "unavailable" };
}

export async function getPublishedStories(locale: Locale, env: Env = process.env): Promise<PublicContentResult<PublicStorySummary[]>> {
  const api = getPublicContentApi({ env });
  return toPublic(await api.listStories(locale), api.mode === "fixture", (d) => d.length === 0, "gated");
}

export async function getPublishedStory(slug: string, locale: Locale, env: Env = process.env): Promise<PublicContentResult<PublicStory>> {
  const api = getPublicContentApi({ env });
  // Gated backend: the URL may become valid once publishing is on, so it is "gated", not "not_found".
  return toPublic(await api.getStory(slug, locale), api.mode === "fixture", () => false, "gated");
}

export async function getPublishedFaq(locale: Locale, env: Env = process.env): Promise<PublicContentResult<PublicFaqItem[]>> {
  const api = getPublicContentApi({ env });
  return toPublic(await api.listFaq(locale), api.mode === "fixture", (d) => d.length === 0);
}
