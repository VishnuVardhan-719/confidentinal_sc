import { fail, ok, type ApiResult } from "@/lib/api/result";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { contentFixtures } from "@/fixtures/operations/content";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import { can, type AdminPrincipal } from "@/modules/admin/capabilities";
import type { ContentApi, PublicContentApi } from "./api";
import { applyDraft, applyTransition, contentActionDenial, draftToBody, parseDraft, toPublicFaq, toPublicStory, toPublicStorySummary } from "./rules";
import { LOCALES } from "./schema";
import type { ContentEntry } from "./types";

export type ContentFixtureOptions = {
  env?: Record<string, string | undefined>;
  principal?: AdminPrincipal | null;
  now?: () => Date;
  /** Share state between the admin and public fixture adapters in tests. */
  store?: ContentFixtureStore;
};

/**
 * Shared fixture state. The ID counter lives here, not in an adapter, so every
 * adapter sharing a store allocates unique entry IDs.
 */
export type ContentFixtureStore = { entries: ContentEntry[]; nextId: number };

export function createContentFixtureStore(): ContentFixtureStore {
  return { entries: cloneFixture(contentFixtures.entries), nextId: 1 };
}

function allocateEntryId(store: ContentFixtureStore): string {
  let id: string;
  do {
    id = `fx-cms-new-${store.nextId}`;
    store.nextId += 1;
  } while (store.entries.some((e) => e.id === id));
  return id;
}

/** Synthetic CMS adapter. Enforces content capabilities and the schema; refuses production. */
export function createContentFixtureApi(options: ContentFixtureOptions = {}): ContentApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const principal = options.principal === undefined ? adminPrincipals.contentEditor : options.principal;
  const now = options.now ?? (() => new Date());
  const store = options.store ?? createContentFixtureStore();
  const once = createReplayCache();

  const canEdit = () => can(principal, "content:edit", { now: now() });

  return {
    mode: "fixture",

    async listEntries(filter = {}) {
      if (!canEdit()) return fail("forbidden");
      const items = store.entries.filter((e) => {
        if (filter.kind !== undefined && e.kind !== filter.kind) return false;
        const versions = filter.locale !== undefined ? [e.locales[filter.locale]] : LOCALES.map((l) => e.locales[l]);
        if (filter.locale !== undefined && !versions[0]) return false;
        if (filter.state !== undefined && !versions.some((v) => v?.working.state === filter.state)) return false;
        return true;
      });
      return ok({ items: cloneFixture(items), nextCursor: null });
    },

    async getEntry(entryId) {
      if (!canEdit()) return fail("forbidden");
      const found = store.entries.find((e) => e.id === entryId);
      return found ? ok(cloneFixture(found)) : fail("not_found");
    },

    async saveDraft(input) {
      return once("draft", input.idempotencyKey, (): ApiResult<ContentEntry> => {
        if (!canEdit() || !principal) return fail("forbidden");
        const parsed = parseDraft(input.draft);
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) fields[issue.path.join(".") || "draft"] = issue.message === "html_forbidden" ? "html_forbidden" : "invalid";
          return fail("validation", { fields });
        }
        const draft = parsed.data;
        const at = now().toISOString();
        let entry = input.entryId === null ? undefined : store.entries.find((e) => e.id === input.entryId);
        if (input.entryId !== null && !entry) return fail("not_found");
        if (entry && entry.kind !== draft.kind) return fail("validation", { fields: { kind: "mismatch" } });
        if (!entry) {
          if (store.entries.some((e) => e.kind === draft.kind && e.slug === draft.slug)) return fail("conflict");
          entry = { id: allocateEntryId(store), kind: draft.kind, slug: draft.slug, locales: {} };
          store.entries.push(entry);
        }
        const current = entry.locales[draft.locale];
        const expected = current ? current.version : null;
        if (expected !== input.expectedVersion) return fail("conflict");
        entry.locales[draft.locale] = applyDraft(current, draft.locale, draftToBody(draft), principal.profileId, at);
        return ok(cloneFixture(entry));
      });
    },

    async transition(input) {
      return once("transition", input.idempotencyKey, (): ApiResult<ContentEntry> => {
        const entry = store.entries.find((e) => e.id === input.entryId);
        const current = entry?.locales[input.locale];
        if (!canEdit() && !can(principal, "content:publish", { now: now() })) return fail("forbidden");
        if (!entry || !current || !principal) return fail("not_found");
        const denial = contentActionDenial(principal, current.working.state, input.action, now(), current.working.content);
        if (denial === "no_capability") return fail("forbidden");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "consent_required") return fail("validation", { fields: { consent: "required" } });
        if (current.version !== input.expectedVersion) return fail("conflict");
        const next = applyTransition(current, input.action, principal.profileId, now().toISOString());
        if (!next) return fail("conflict");
        entry.locales[input.locale] = next;
        return ok(cloneFixture(entry));
      });
    },

    async listRevisions({ entryId, locale }) {
      if (!canEdit()) return fail("forbidden");
      const version = store.entries.find((e) => e.id === entryId)?.locales[locale];
      return version ? ok(cloneFixture(version.history)) : fail("not_found");
    },
  };
}

/** Synthetic public read model. Serves only published snapshots; no auth needed. */
export function createPublicContentFixtureApi(options: Pick<ContentFixtureOptions, "env" | "store"> = {}): PublicContentApi {
  assertFixtureAllowed(options.env ?? process.env);
  const store = options.store ?? createContentFixtureStore();

  return {
    mode: "fixture",
    async listStories(locale) {
      const items = store.entries.map((e) => toPublicStorySummary(e, locale)).filter((s) => s !== null);
      items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      return ok(cloneFixture(items));
    },
    async getStory(slug, locale) {
      const entry = store.entries.find((e) => e.kind === "story" && e.slug === slug);
      const story = entry ? toPublicStory(entry, locale) : null;
      return story ? ok(cloneFixture(story)) : fail("not_found");
    },
    async listFaq(locale) {
      const items = store.entries.map((e) => toPublicFaq(e, locale)).filter((f) => f !== null);
      items.sort((a, b) => a.order - b.order);
      return ok(cloneFixture(items));
    },
  };
}
