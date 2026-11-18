import { can, type AdminPrincipal } from "@/modules/admin/capabilities";
import { contentDraftSchema, type ContentDraftInput, type Locale } from "./schema";
import type {
  ContentAction,
  ContentBody,
  ContentEntry,
  ContentState,
  LocaleVersion,
  PublicFaqItem,
  PublicStory,
  PublicStorySummary,
} from "./types";

const TRANSITIONS: Record<ContentAction, { from: readonly ContentState[]; to: ContentState }> = {
  submit_preview: { from: ["draft"], to: "in_preview" },
  return_to_draft: { from: ["in_preview"], to: "draft" },
  publish: { from: ["in_preview"], to: "published" },
  archive: { from: ["published"], to: "archived" },
};

export function nextContentState(current: ContentState, action: ContentAction): ContentState | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

/** Publishing and archiving need the publisher capability; editing and preview need content:edit. */
export function contentCapabilityFor(action: ContentAction | "edit") {
  return action === "publish" || action === "archive" ? ("content:publish" as const) : ("content:edit" as const);
}

export type ContentDenial = "no_capability" | "invalid_transition";

export function contentActionDenial(
  admin: AdminPrincipal | null | undefined,
  current: ContentState,
  action: ContentAction,
  now: Date = new Date(),
): ContentDenial | null {
  if (!can(admin, contentCapabilityFor(action), { now })) return "no_capability";
  return nextContentState(current, action) === null ? "invalid_transition" : null;
}

export function draftToBody(draft: ContentDraftInput): ContentBody {
  if (draft.kind === "faq") return { kind: "faq", question: draft.question, answer: draft.answer, order: draft.order };
  return { kind: draft.kind, title: draft.title, summary: draft.summary, body: draft.body, consentEvidenceId: draft.consentEvidenceId };
}

/** Validates untrusted draft input (rejects HTML/script/unsafe links/extra fields). */
export function parseDraft(input: unknown) {
  return contentDraftSchema.safeParse(input);
}

/**
 * Saves a draft into a locale version. Editing while published starts a new
 * working revision; the published snapshot keeps serving until the next publish.
 */
export function applyDraft(
  version: LocaleVersion | undefined,
  locale: Locale,
  body: ContentBody,
  actorProfileId: string,
  at: string,
): LocaleVersion {
  if (!version) {
    return {
      locale,
      working: { revision: 1, state: "draft", content: body, updatedAt: at },
      published: null,
      history: [{ revision: 1, state: "draft", editedByProfileId: actorProfileId, editedAt: at, publishedByProfileId: null, publishedAt: null }],
      version: 1,
    };
  }
  const newRevision = version.working.state === "draft" ? version.working.revision : version.working.revision + 1;
  return {
    ...version,
    working: { revision: newRevision, state: "draft", content: body, updatedAt: at },
    history: [
      ...version.history.filter((h) => !(h.revision === newRevision && h.state === "draft")),
      { revision: newRevision, state: "draft", editedByProfileId: actorProfileId, editedAt: at, publishedByProfileId: null, publishedAt: null },
    ],
    version: version.version + 1,
  };
}

export function applyTransition(version: LocaleVersion, action: ContentAction, actorProfileId: string, at: string): LocaleVersion | null {
  const next = nextContentState(version.working.state, action);
  if (next === null) return null;
  const record = {
    revision: version.working.revision,
    state: next,
    editedByProfileId: actorProfileId,
    editedAt: at,
    publishedByProfileId: next === "published" ? actorProfileId : null,
    publishedAt: next === "published" ? at : null,
  };
  return {
    ...version,
    working: { ...version.working, state: next, updatedAt: at },
    published:
      next === "published"
        ? { revision: version.working.revision, content: version.working.content, publishedAt: at }
        : next === "archived"
          ? null
          : version.published,
    history: [...version.history, record],
    version: version.version + 1,
  };
}

// ---------------------------------------------------------------------------
// Public read model: only published snapshots. Falls back to `en` explicitly.
// ---------------------------------------------------------------------------

function publishedFor(entry: ContentEntry, locale: Locale): { servedLocale: Locale; snap: NonNullable<LocaleVersion["published"]> } | null {
  const own = entry.locales[locale]?.published;
  if (own) return { servedLocale: locale, snap: own };
  const fallback = entry.locales.en?.published;
  return fallback ? { servedLocale: "en", snap: fallback } : null;
}

export function toPublicStory(entry: ContentEntry, locale: Locale): PublicStory | null {
  if (entry.kind !== "story") return null;
  const found = publishedFor(entry, locale);
  if (!found || found.snap.content.kind !== "story") return null;
  const { title, summary, body } = found.snap.content;
  return { slug: entry.slug, servedLocale: found.servedLocale, title, summary, body, publishedAt: found.snap.publishedAt };
}

export function toPublicStorySummary(entry: ContentEntry, locale: Locale): PublicStorySummary | null {
  const story = toPublicStory(entry, locale);
  if (!story) return null;
  return { slug: story.slug, servedLocale: story.servedLocale, title: story.title, summary: story.summary, publishedAt: story.publishedAt };
}

export function toPublicFaq(entry: ContentEntry, locale: Locale): PublicFaqItem | null {
  if (entry.kind !== "faq") return null;
  const found = publishedFor(entry, locale);
  if (!found || found.snap.content.kind !== "faq") return null;
  const { question, answer, order } = found.snap.content;
  return { slug: entry.slug, servedLocale: found.servedLocale, question, answer, order };
}
