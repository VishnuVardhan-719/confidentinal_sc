import { describe, expect, it } from "vitest";
import type { ApiResult } from "@/lib/api/result";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { auditFixtures } from "@/fixtures/operations/audit";
import { contentFixtures } from "@/fixtures/operations/content";
import { applyAuditFilter, redactAuditEvent, scopedAuditEvents } from "@/modules/audit/rules";
import { describeCategory, describeOutcome } from "@/modules/audit/status";
import { draftFromForm, emptyEditorForm, parseInline, validateEditorForm } from "@/modules/content/editor";
import { createContentFixtureApi, createContentFixtureStore, createPublicContentFixtureApi } from "@/modules/content/fixture";
import { applyDraft, applyTransition, toPublicFaq, toPublicStory, toPublicStorySummary } from "@/modules/content/rules";
import { contentDraftSchema, safeHref } from "@/modules/content/schema";

const data = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
};
const code = <T>(r: ApiResult<T>) => (r.ok ? "ok" : r.error.code);
const [STORY, FAQ, PAGE] = contentFixtures.entries;
const doc = { type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text: "Fixture." }] }] };

describe("content schema and editor branches", () => {
  it("pages cannot carry consent evidence; FAQ needs an integer order", () => {
    const page = { kind: "page", slug: "p", locale: "en", title: "T", summary: "", body: doc };
    expect(contentDraftSchema.safeParse({ ...page, consentEvidenceId: null }).success).toBe(true);
    expect(contentDraftSchema.safeParse({ ...page, consentEvidenceId: "fx-consent-1" }).success).toBe(false);
    const faq = { kind: "faq", slug: "f", locale: "te", question: "Q", answer: doc };
    expect(contentDraftSchema.safeParse({ ...faq, order: 1.5 }).success).toBe(false);
    expect(contentDraftSchema.safeParse({ ...faq, order: 3 }).success).toBe(true);
    expect(contentDraftSchema.safeParse({ ...faq, locale: "fr", order: 3 }).success).toBe(false);
  });

  it("internal and https links are allowed; editor order and page consent map correctly", () => {
    expect(safeHref.safeParse("/te/faq").success).toBe(true);
    expect(parseInline("*it*")).toEqual([{ type: "text", text: "it", marks: ["italic"] }]);
    expect(parseInline("")).toEqual([]);
    const faqForm = { ...emptyEditorForm("faq", "en"), slug: "f", question: "Q", answerText: "A", order: "abc" };
    const res = validateEditorForm(faqForm);
    expect(!res.ok && res.errors.order).toBe("invalid");
    expect(draftFromForm({ ...emptyEditorForm("page", "en"), consentEvidenceId: "x" })).toMatchObject({ consentEvidenceId: null, noIdentifiablePerson: false });
    expect(!validateEditorForm({ ...emptyEditorForm("story", "en"), slug: "s", title: "T", bodyText: "" }).ok).toBe(true);
  });
});

describe("content rules branches", () => {
  it("editing a published version opens a new draft revision and keeps the live snapshot", () => {
    const en = FAQ.locales.en!;
    const next = applyDraft(en, "en", en.working.content, "fx-adm-editor", "2026-11-20T00:00:00Z");
    expect(next.working).toMatchObject({ revision: 2, state: "draft" });
    expect(next.published?.revision).toBe(1);
    const again = applyDraft(next, "en", en.working.content, "fx-adm-editor", "2026-11-20T01:00:00Z");
    expect(again.working.revision).toBe(2); // re-saving a draft keeps the revision
    expect(again.history.filter((h) => h.revision === 2 && h.state === "draft")).toHaveLength(1);
  });

  it("archive withdraws the public snapshot; invalid transitions return null", () => {
    const en = FAQ.locales.en!;
    const archived = applyTransition(en, "archive", "fx-adm-publisher", "2026-11-20T00:00:00Z");
    expect(archived?.published).toBeNull();
    expect(applyTransition(en, "submit_preview", "x", "t")).toBeNull();
    expect(toPublicFaq({ ...FAQ, locales: { en: archived! } }, "en")).toBeNull();
  });

  it("public projections ignore other kinds and unpublished locales", () => {
    expect(toPublicStory(FAQ, "en")).toBeNull();
    expect(toPublicFaq(STORY, "en")).toBeNull();
    expect(toPublicStory(PAGE, "en")).toBeNull();
    expect(toPublicStorySummary(STORY, "hi")).toMatchObject({ servedLocale: "en", title: "Synthetic story one" });
    expect(Object.keys(toPublicStorySummary(STORY, "en")!)).not.toContain("body");
  });
});

describe("content fixture adapter branches", () => {
  it("list filters by kind, state and locale; non-editors are denied", async () => {
    const api = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor });
    expect(data(await api.listEntries({ kind: "faq" })).items.map((e) => e.id)).toEqual(["fx-cms-faq-1"]);
    expect(data(await api.listEntries({ state: "in_preview" })).items.map((e) => e.id)).toEqual(["fx-cms-faq-1"]);
    expect(data(await api.listEntries({ locale: "hi" })).items.map((e) => e.id)).toEqual(["fx-cms-faq-1"]);
    expect(data(await api.listEntries({ locale: "te" })).items).toEqual([]);
    expect(code(await api.getEntry("nope"))).toBe("not_found");
    expect(code(await api.listRevisions({ entryId: "fx-cms-faq-1", locale: "te" }))).toBe("not_found");
    const none = createContentFixtureApi({ env: {}, principal: adminPrincipals.noGrants });
    expect(code(await none.getEntry("fx-cms-faq-1"))).toBe("forbidden");
    expect(code(await none.listRevisions({ entryId: "fx-cms-faq-1", locale: "en" }))).toBe("forbidden");
    expect(code(await none.transition({ entryId: "fx-cms-faq-1", locale: "en", action: "archive", expectedVersion: 3, idempotencyKey: "x" }))).toBe("forbidden");
  });

  it("saveDraft: update, new locale, unknown entry, kind mismatch, duplicate slug, stale version", async () => {
    const api = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor });
    const page = { kind: "page", slug: PAGE.slug, locale: "en", title: "Updated", summary: "", body: doc, consentEvidenceId: null };
    expect(data(await api.saveDraft({ entryId: PAGE.id, draft: page, expectedVersion: 1, idempotencyKey: "u" })).locales.en?.version).toBe(2);
    expect(code(await api.saveDraft({ entryId: PAGE.id, draft: page, expectedVersion: 1, idempotencyKey: "u2" }))).toBe("conflict");
    const teFaq = { kind: "faq", slug: FAQ.slug, locale: "te", question: "Q", answer: doc, order: 1 };
    expect(data(await api.saveDraft({ entryId: FAQ.id, draft: teFaq, expectedVersion: null, idempotencyKey: "t" })).locales.te?.working.state).toBe("draft");
    expect(code(await api.saveDraft({ entryId: "nope", draft: page, expectedVersion: null, idempotencyKey: "n" }))).toBe("not_found");
    expect(await api.saveDraft({ entryId: PAGE.id, draft: { ...teFaq, slug: PAGE.slug }, expectedVersion: 2, idempotencyKey: "k" })).toEqual({ ok: false, error: { code: "validation", fields: { kind: "mismatch" } } });
    const dup = { kind: "story", slug: STORY.slug, locale: "en", title: "T", summary: "", body: doc, consentEvidenceId: null };
    expect(code(await api.saveDraft({ entryId: null, draft: dup, expectedVersion: null, idempotencyKey: "d" }))).toBe("conflict");
  });

  it("editor can return a preview to draft; publisher archives; public FAQ updates", async () => {
    const store = createContentFixtureStore();
    const editor = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor, store });
    const publisher = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentPublisher, store });
    expect(data(await editor.transition({ entryId: FAQ.id, locale: "hi", action: "return_to_draft", expectedVersion: 2, idempotencyKey: "r" })).locales.hi?.working.state).toBe("draft");
    expect(code(await editor.transition({ entryId: FAQ.id, locale: "en", action: "archive", expectedVersion: 3, idempotencyKey: "e" }))).toBe("forbidden");
    expect(code(await publisher.transition({ entryId: FAQ.id, locale: "en", action: "archive", expectedVersion: 2, idempotencyKey: "s" }))).toBe("conflict");
    data(await publisher.transition({ entryId: FAQ.id, locale: "en", action: "archive", expectedVersion: 3, idempotencyKey: "a" }));
    const site = createPublicContentFixtureApi({ env: {}, store });
    expect(data(await site.listFaq("en"))).toEqual([]);
    expect(code(await site.getStory("synthetic-faq-booking", "en"))).toBe("not_found");
    expect(data(await site.listStories("en")).map((s) => s.slug)).toEqual(["synthetic-story-one"]);
  });
});

describe("audit branches", () => {
  const events = auditFixtures.rawEvents.map(redactAuditEvent);

  it("filters by category, action, target, actor and time range, newest first", () => {
    expect(applyAuditFilter(events, { category: "booking" }).map((e) => e.id)).toEqual(["fx-aud-3", "fx-aud-2"]);
    expect(applyAuditFilter(events, { action: "trip.interrupted" }).map((e) => e.id)).toEqual(["fx-aud-2"]);
    expect(applyAuditFilter(events, { targetType: "content_entry" }).map((e) => e.id)).toEqual(["fx-aud-4"]);
    expect(applyAuditFilter(events, { targetId: "fx-prov-lab-2" }).map((e) => e.id)).toEqual(["fx-aud-5"]);
    expect(applyAuditFilter(events, { actorProfileId: "fx-adm-verifier" }).map((e) => e.id)).toEqual(["fx-aud-1"]);
    expect(applyAuditFilter(events, { from: "2026-11-19T00:00:00Z", to: "2026-11-19T06:00:00Z" }).map((e) => e.id)).toEqual(["fx-aud-3", "fx-aud-2"]);
  });

  it("platform-level events need a global grant; reasons may be null", () => {
    expect(scopedAuditEvents(adminPrincipals.orgAuditor, events).some((e) => e.organizationId === null)).toBe(false);
    expect(scopedAuditEvents(adminPrincipals.superAdmin, events)).toHaveLength(5);
    expect(scopedAuditEvents(null, events)).toEqual([]);
    expect(redactAuditEvent({ ...auditFixtures.rawEvents[3], reason: undefined }).reason).toBeNull();
    expect(describeOutcome("ok").known).toBe(false);
    expect(describeCategory("billing").known).toBe(false);
  });
});
