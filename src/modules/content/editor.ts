import type { AdminPrincipal } from "@/modules/admin/capabilities";
import { can } from "@/modules/admin/capabilities";
import { contentCapabilityFor, nextContentState } from "./rules";
import { contentDraftSchema, LOCALES, type ContentDraftInput, type Locale, type RichTextBlock, type RichTextDoc, type RichTextInline } from "./schema";
import { describeContent, type StatusDescriptor } from "./status";
import type { ContentAction, ContentBody, ContentEntry, ContentKind, ContentRevision, ContentState } from "./types";

/**
 * CMS editor logic. The editor is a plain textarea with a tiny markup subset
 * that maps 1:1 onto the approved rich-text nodes:
 *
 *   ## Heading        ### Subheading
 *   - bullet item     1. ordered item
 *   **bold**  *italic*  [label](/en/path or https://...)
 *   blank line = new block
 *
 * Nothing here produces HTML. The result is validated by contentDraftSchema,
 * which rejects HTML, script and unsafe links.
 */

// ---------------------------------------------------------------------------
// Markup <-> rich text
// ---------------------------------------------------------------------------

const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

export function parseInline(text: string): RichTextInline[] {
  const out: RichTextInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", text: text.slice(last, index) });
    if (m[1] !== undefined && m[2] !== undefined) out.push({ type: "link", href: m[2], children: [{ type: "text", text: m[1] }] });
    else if (m[3] !== undefined) out.push({ type: "text", text: m[3], marks: ["bold"] });
    else if (m[4] !== undefined) out.push({ type: "text", text: m[4], marks: ["italic"] });
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.filter((node) => node.type !== "text" || node.text.length > 0);
}

const BULLET = /^- (.*)$/;
const ORDERED = /^\d+\. (.*)$/;

export function parseEditorMarkup(source: string): RichTextDoc {
  const blocks: RichTextBlock[] = [];
  const chunks = source.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((c) => c.trim()).filter((c) => c.length > 0);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim());
    if (lines.length === 1 && lines[0].startsWith("### ")) blocks.push({ type: "heading", level: 3, children: parseInline(lines[0].slice(4)) });
    else if (lines.length === 1 && lines[0].startsWith("## ")) blocks.push({ type: "heading", level: 2, children: parseInline(lines[0].slice(3)) });
    else if (lines.every((l) => BULLET.test(l))) blocks.push({ type: "list", style: "bullet", items: lines.map((l) => parseInline(l.replace(BULLET, "$1"))) });
    else if (lines.every((l) => ORDERED.test(l))) blocks.push({ type: "list", style: "ordered", items: lines.map((l) => parseInline(l.replace(ORDERED, "$1"))) });
    else blocks.push({ type: "paragraph", children: parseInline(lines.join(" ")) });
  }
  return { type: "doc", blocks };
}

function serializeInline(nodes: readonly RichTextInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === "link") return `[${n.children.map((c) => c.text).join("")}](${n.href})`;
      if (n.marks?.includes("bold")) return `**${n.text}**`;
      if (n.marks?.includes("italic")) return `*${n.text}*`;
      return n.text;
    })
    .join("");
}

export function serializeEditorMarkup(doc: RichTextDoc): string {
  return doc.blocks
    .map((b) => {
      if (b.type === "heading") return `${b.level === 2 ? "##" : "###"} ${serializeInline(b.children)}`;
      if (b.type === "list") return b.items.map((item, i) => `${b.style === "bullet" ? "-" : `${i + 1}.`} ${serializeInline(item)}`).join("\n");
      return serializeInline(b.children);
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Editor form
// ---------------------------------------------------------------------------

export type EditorForm = {
  kind: ContentKind;
  slug: string;
  locale: Locale;
  /** story/page */
  title: string;
  summary: string;
  bodyText: string;
  consentEvidenceId: string;
  /** faq */
  question: string;
  answerText: string;
  order: string;
};

export const emptyEditorForm = (kind: ContentKind, locale: Locale): EditorForm => ({
  kind,
  slug: "",
  locale,
  title: "",
  summary: "",
  bodyText: "",
  consentEvidenceId: "",
  question: "",
  answerText: "",
  order: "0",
});

export function editorFormFromBody(slug: string, locale: Locale, body: ContentBody): EditorForm {
  const base = emptyEditorForm(body.kind, locale);
  if (body.kind === "faq") return { ...base, slug, question: body.question, answerText: serializeEditorMarkup(body.answer), order: String(body.order) };
  return { ...base, slug, title: body.title, summary: body.summary, bodyText: serializeEditorMarkup(body.body), consentEvidenceId: body.consentEvidenceId ?? "" };
}

/** Unvalidated draft object; always pass it through validateEditorForm or the API (which validates again). */
export function draftFromForm(form: EditorForm): Record<string, unknown> {
  if (form.kind === "faq") {
    return {
      kind: "faq",
      slug: form.slug.trim(),
      locale: form.locale,
      question: form.question,
      answer: parseEditorMarkup(form.answerText),
      order: /^\d{1,5}$/.test(form.order.trim()) ? Number(form.order.trim()) : NaN,
    };
  }
  return {
    kind: form.kind,
    slug: form.slug.trim(),
    locale: form.locale,
    title: form.title,
    summary: form.summary,
    body: parseEditorMarkup(form.bodyText),
    consentEvidenceId: form.kind === "page" || form.consentEvidenceId.trim() === "" ? null : form.consentEvidenceId.trim(),
  };
}

export type EditorField = "slug" | "title" | "summary" | "bodyText" | "consentEvidenceId" | "question" | "answerText" | "order" | "form";

const FIELD_FOR_PATH: Record<string, EditorField> = {
  slug: "slug",
  title: "title",
  summary: "summary",
  body: "bodyText",
  consentEvidenceId: "consentEvidenceId",
  question: "question",
  answer: "answerText",
  order: "order",
};

export type EditorValidation =
  | { ok: true; draft: ContentDraftInput }
  | { ok: false; errors: Partial<Record<EditorField, "required" | "too_long" | "html_forbidden" | "unsafe_link" | "invalid">> };

/** Field-level validation for the error summary. First error per field wins. */
export function validateEditorForm(form: EditorForm): EditorValidation {
  const parsed = contentDraftSchema.safeParse(draftFromForm(form));
  if (parsed.success) return { ok: true, draft: parsed.data };
  const errors: Extract<EditorValidation, { ok: false }>["errors"] = {};
  for (const issue of parsed.error.issues) {
    const field = FIELD_FOR_PATH[String(issue.path[0] ?? "")] ?? "form";
    if (errors[field]) continue;
    errors[field] =
      issue.message === "html_forbidden"
        ? "html_forbidden"
        : issue.message === "unsafe_href"
          ? "unsafe_link"
          : issue.code === "too_small"
            ? "required"
            : issue.code === "too_big"
              ? "too_long"
              : "invalid";
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Locale versions, actions, revisions, preview
// ---------------------------------------------------------------------------

export type LocaleCellVM = {
  locale: Locale;
  exists: boolean;
  status: StatusDescriptor | null;
  workingRevision: number | null;
  publishedRevision: number | null;
  /** Working copy differs from what the public site serves. */
  hasUnpublishedChanges: boolean;
  version: number | null;
};

export function localeMatrix(entry: ContentEntry): LocaleCellVM[] {
  return LOCALES.map((locale) => {
    const v = entry.locales[locale];
    if (!v) return { locale, exists: false, status: null, workingRevision: null, publishedRevision: null, hasUnpublishedChanges: false, version: null };
    return {
      locale,
      exists: true,
      status: describeContent(v.working.state),
      workingRevision: v.working.revision,
      publishedRevision: v.published?.revision ?? null,
      hasUnpublishedChanges: v.working.state !== "published" && v.working.state !== "archived",
      version: v.version,
    };
  });
}

const ACTIONS: readonly ContentAction[] = ["submit_preview", "return_to_draft", "publish", "archive"];

/** Workflow buttons to show for this state and principal. Server re-checks capability and version. */
export function availableContentActions(principal: AdminPrincipal | null, state: ContentState, now: Date = new Date()): ContentAction[] {
  return ACTIONS.filter((a) => nextContentState(state, a) !== null && can(principal, contentCapabilityFor(a), { now }));
}

export type RevisionRowVM = {
  revision: number;
  status: StatusDescriptor;
  editedByProfileId: string;
  editedAt: string;
  publishedAt: string | null;
};

/** Newest first. */
export const revisionRows = (history: readonly ContentRevision[]): RevisionRowVM[] =>
  [...history]
    .sort((a, b) => Date.parse(b.editedAt) - Date.parse(a.editedAt) || b.revision - a.revision)
    .map((h) => ({ revision: h.revision, status: describeContent(h.state), editedByProfileId: h.editedByProfileId, editedAt: h.editedAt, publishedAt: h.publishedAt }));

export type PreviewVM = { locale: Locale; revision: number; status: StatusDescriptor; content: ContentBody; isLive: boolean };

/** Admin preview of the working copy. Clearly marked: it is not what the public site serves unless isLive. */
export function previewFor(entry: ContentEntry, locale: Locale): PreviewVM | null {
  const v = entry.locales[locale];
  if (!v) return null;
  return {
    locale,
    revision: v.working.revision,
    status: describeContent(v.working.state),
    content: v.working.content,
    isLive: v.working.state === "published" && v.published?.revision === v.working.revision,
  };
}
