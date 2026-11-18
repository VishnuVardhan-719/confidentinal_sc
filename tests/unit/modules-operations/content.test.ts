import { describe, expect, it } from "vitest";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { createContentFixtureApi, createContentFixtureStore, createPublicContentFixtureApi } from "@/modules/content/fixture";
import { createPublicContentHttpApi } from "@/modules/content/http";
import { containsMarkup, contentDraftSchema, safeHref, sanitizeText } from "@/modules/content/schema";
import { describeContent } from "@/modules/content/status";

const para = (text: string) => ({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text }] }] });
const story = (over: Record<string, unknown> = {}) => ({
  kind: "story",
  slug: "fixture-story",
  locale: "en",
  title: "Fixture title",
  summary: "Fixture summary",
  body: para("Plain fixture text."),
  consentEvidenceId: null,
  ...over,
});

describe("CMS rejects HTML and script", () => {
  it("accepts plain text and the approved rich-text subset", () => {
    const doc = {
      type: "doc",
      blocks: [
        { type: "heading", level: 2, children: [{ type: "text", text: "Heading" }] },
        { type: "paragraph", children: [{ type: "text", text: "Bold", marks: ["bold"] }, { type: "link", href: "/en/faq", children: [{ type: "text", text: "FAQ" }] }] },
        { type: "list", style: "bullet", items: [[{ type: "text", text: "One" }], [{ type: "text", text: "Two" }]] },
      ],
    };
    expect(contentDraftSchema.safeParse(story({ body: doc })).success).toBe(true);
  });

  it.each([
    ["<script>alert(1)</script>"],
    ["Hello <b>bold</b>"],
    ["<img src=x onerror=alert(1)>"],
    ["</p>"],
    ["<!-- comment -->"],
    ["&lt;script&gt;"],
    ["&#60;script&#62;"],
    ["click javascript:alert(1)"],
    ["< svg onload=alert(1)>"],
  ])("rejects %s in plain text and rich text", (payload) => {
    expect(containsMarkup(payload)).toBe(true);
    expect(contentDraftSchema.safeParse(story({ title: payload })).success).toBe(false);
    expect(contentDraftSchema.safeParse(story({ body: para(payload) })).success).toBe(false);
  });

  it("rejects raw HTML bodies, unapproved nodes and unsafe links", () => {
    expect(contentDraftSchema.safeParse(story({ body: "<p>raw html</p>" })).success).toBe(false);
    expect(contentDraftSchema.safeParse(story({ body: { type: "doc", blocks: [{ type: "html", value: "<p>x</p>" }] } })).success).toBe(false);
    expect(contentDraftSchema.safeParse(story({ body: { type: "doc", blocks: [{ type: "heading", level: 1, children: [{ type: "text", text: "h1" }] }] } })).success).toBe(false);
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "http://plain.example", "https://user:pw@x.example", "/ok path"]) {
      expect(safeHref.safeParse(href).success).toBe(false);
    }
    expect(safeHref.safeParse("https://surecurevisit.in/en/faq").success).toBe(true);
  });

  it("rejects fields outside content (price, verification, clinical)", () => {
    for (const extra of [{ pricePaise: 100 }, { verificationState: "approved" }, { diagnosis: "x" }, { html: "<p/>" }]) {
      expect(contentDraftSchema.safeParse(story(extra)).success).toBe(false);
    }
  });

  it("sanitizes control and bidi-override characters", () => {
    expect(sanitizeText("  a\u0000b\u202Ec\r\nd  ")).toBe("abc\nd");
  });

  it("fixture saveDraft returns validation for script content", async () => {
    const api = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor });
    const res = await api.saveDraft({ entryId: null, draft: story({ title: "<script>x</script>" }), expectedVersion: null, idempotencyKey: "d1" });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe("validation");
    expect(!res.ok && res.error.fields?.title).toBe("html_forbidden");
  });
});

describe("CMS workflow and public read model", () => {
  it("draft -> preview -> publish needs the publisher role; public sees only published", async () => {
    const store = createContentFixtureStore();
    const editor = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor, store });
    const publisher = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentPublisher, store });
    const site = createPublicContentFixtureApi({ env: {}, store });

    const saved = await editor.saveDraft({ entryId: null, draft: story({ slug: "new-fixture-story", title: "New fixture", noIdentifiablePerson: true }), expectedVersion: null, idempotencyKey: "a" });
    if (!saved.ok) throw new Error("save failed");
    const id = saved.data.id;
    expect((await site.getStory("new-fixture-story", "en")).ok).toBe(false);

    const preview = await editor.transition({ entryId: id, locale: "en", action: "submit_preview", expectedVersion: 1, idempotencyKey: "b" });
    expect(preview.ok && preview.data.locales.en?.working.state).toBe("in_preview");

    const editorPublish = await editor.transition({ entryId: id, locale: "en", action: "publish", expectedVersion: 2, idempotencyKey: "c" });
    expect(editorPublish).toEqual({ ok: false, error: { code: "forbidden" } });

    const published = await publisher.transition({ entryId: id, locale: "en", action: "publish", expectedVersion: 2, idempotencyKey: "d" });
    expect(published.ok && published.data.locales.en?.published?.revision).toBe(1);

    const story1 = await site.getStory("new-fixture-story", "te");
    expect(story1.ok && story1.data.servedLocale).toBe("en");
    expect(story1.ok && story1.data.title).toBe("New fixture");

    const revisions = await editor.listRevisions({ entryId: id, locale: "en" });
    expect(revisions.ok && revisions.data.map((r) => r.state)).toEqual(["draft", "in_preview", "published"]);
  });

  it("a newer draft does not replace the live published snapshot", async () => {
    const site = createPublicContentFixtureApi({ env: {} });
    const live = await site.getStory("synthetic-story-one", "en");
    expect(live.ok && live.data.title).toBe("Synthetic story one");
    const faq = await site.listFaq("hi");
    expect(faq.ok && faq.data.map((f) => f.servedLocale)).toEqual(["en"]); // hi is only in preview
  });

  it("public http adapter is gated (no contract) and unknown CMS status is not published", async () => {
    expect(await createPublicContentHttpApi().listStories("en")).toEqual({ ok: false, error: { code: "gated" } });
    expect(describeContent("live").known).toBe(false);
    expect(describeContent("published").tone).toBe("success");
  });
});

describe("content fixture store", () => {
  it("two adapters sharing one store allocate unique entry IDs", async () => {
    const store = createContentFixtureStore();
    const a = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor, store });
    const b = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentPublisher, store });
    const first = await a.saveDraft({ entryId: null, draft: story({ slug: "store-slug-a" }), expectedVersion: null, idempotencyKey: "u1" });
    const second = await b.saveDraft({ entryId: null, draft: story({ slug: "store-slug-b" }), expectedVersion: null, idempotencyKey: "u1" });
    const third = await a.saveDraft({ entryId: null, draft: story({ slug: "store-slug-c" }), expectedVersion: null, idempotencyKey: "u2" });
    if (!first.ok || !second.ok || !third.ok) throw new Error("save failed");
    const ids = [first.data.id, second.data.id, third.data.id];
    expect(new Set(ids).size).toBe(3);
    expect(new Set(store.entries.map((e) => e.id)).size).toBe(store.entries.length);
    const fromB = await b.getEntry(first.data.id);
    expect(fromB.ok && fromB.data.slug).toBe("store-slug-a");
  });
});
