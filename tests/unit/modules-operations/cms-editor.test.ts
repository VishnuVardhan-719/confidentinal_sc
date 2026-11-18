import { describe, expect, it } from "vitest";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { contentFixtures } from "@/fixtures/operations/content";
import {
  availableContentActions,
  draftFromForm,
  editorFormFromBody,
  emptyEditorForm,
  localeMatrix,
  parseEditorMarkup,
  previewFor,
  revisionRows,
  serializeEditorMarkup,
  validateEditorForm,
} from "@/modules/content/editor";
import { loadContentEditor, loadContentList } from "@/modules/content/loaders";
import { contentDraftSchema } from "@/modules/content/schema";

const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const NOW = new Date("2026-11-20T00:00:00Z");

describe("editor markup", () => {
  const source = "## Booking\n\nA provider **reviews** each request *manually*. See [FAQ](/en/faq).\n\n- One\n- Two\n\n1. First\n2. Second";

  it("parses into the approved rich-text subset and round-trips", () => {
    const doc = parseEditorMarkup(source);
    expect(doc.blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list"]);
    expect(serializeEditorMarkup(doc)).toBe(source);
    expect(parseEditorMarkup(serializeEditorMarkup(doc))).toEqual(doc);
  });

  it("produces drafts the content schema accepts", () => {
    const form = { ...emptyEditorForm("story", "en"), slug: "fixture-story", title: "Title", bodyText: source };
    const result = validateEditorForm(form);
    expect(result.ok).toBe(true);
    expect(contentDraftSchema.safeParse(draftFromForm(form)).success).toBe(true);
  });

  it("reports HTML, script, unsafe links and missing fields per field", () => {
    const bad = {
      ...emptyEditorForm("story", "en"),
      slug: "Bad Slug",
      title: "<b>x</b>",
      bodyText: "Click [here](javascript:alert(1))",
    };
    const res = validateEditorForm(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.title).toBe("html_forbidden");
    expect(res.errors.bodyText).toBe("unsafe_link");
    expect(res.errors.slug).toBe("invalid");
    const empty = validateEditorForm({ ...emptyEditorForm("faq", "en"), slug: "faq-x" });
    expect(!empty.ok && empty.errors.question).toBe("required");
    const script = validateEditorForm({ ...emptyEditorForm("faq", "te"), slug: "faq-x", question: "Q", answerText: "<script>alert(1)</script>" });
    expect(!script.ok && script.errors.answerText).toBe("html_forbidden");
  });

  it("prefills the form from a working copy", () => {
    const story = contentFixtures.entries[0];
    const form = editorFormFromBody(story.slug, "en", story.locales.en!.working.content);
    expect(form.title).toBe("Synthetic story one (revised draft)");
    expect(form.consentEvidenceId).toBe("fx-consent-1");
  });
});

describe("CMS view models", () => {
  const [story, faq] = contentFixtures.entries;

  it("locale matrix shows missing locales and unpublished changes", () => {
    const m = localeMatrix(faq);
    expect(m.map((c) => [c.locale, c.exists, c.status?.labelKey ?? null, c.hasUnpublishedChanges])).toEqual([
      ["en", true, "admin.cms.status.published", false],
      ["te", false, null, false],
      ["hi", true, "admin.cms.status.inPreview", true],
    ]);
    expect(localeMatrix(story)[0]).toMatchObject({ workingRevision: 2, publishedRevision: 1, hasUnpublishedChanges: true });
  });

  it("only publishers see publish/archive actions", () => {
    expect(availableContentActions(adminPrincipals.contentEditor, "in_preview", NOW)).toEqual(["return_to_draft"]);
    const withConsent = story.locales.en!.working.content;
    expect(availableContentActions(adminPrincipals.contentPublisher, "in_preview", NOW, withConsent)).toEqual(["return_to_draft", "publish"]);
    // Fail closed: without the working copy, publish is never offered.
    expect(availableContentActions(adminPrincipals.contentPublisher, "in_preview", NOW)).toEqual(["return_to_draft"]);
    expect(availableContentActions(adminPrincipals.contentEditor, "published", NOW)).toEqual([]);
    expect(availableContentActions(adminPrincipals.noGrants, "draft", NOW)).toEqual([]);
  });

  it("revision history is newest first; preview marks whether it is live", () => {
    expect(revisionRows(story.locales.en!.history).map((r) => r.revision)).toEqual([2, 1, 1, 1]);
    expect(previewFor(story, "en")).toMatchObject({ revision: 2, isLive: false });
    expect(previewFor(faq, "en")).toMatchObject({ revision: 1, isLive: true });
    expect(previewFor(faq, "te")).toBeNull();
  });

  it("loaders return the editor model and deny non-editors", async () => {
    const editor = await loadContentEditor({ principal: adminPrincipals.contentEditor, env: FX, now: () => NOW }, "fx-cms-faq-1", "te");
    if (editor.status !== "ok") throw new Error(editor.status);
    expect(editor.data.expectedVersion).toBeNull();
    expect(editor.data.form).toMatchObject({ kind: "faq", slug: "synthetic-faq-booking", question: "" });
    const list = await loadContentList({ principal: adminPrincipals.verifier, env: FX });
    expect(list).toEqual({ status: "denied" });
  });
});
