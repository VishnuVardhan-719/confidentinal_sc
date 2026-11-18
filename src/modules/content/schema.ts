import { z } from "zod";

/**
 * CMS content schema. Content is plain text plus an approved structured
 * rich-text subset (paragraph, heading 2/3, bullet/ordered list, bold/italic,
 * safe links). Raw HTML, script, event handlers, entity-encoded markup and
 * unsafe URLs are rejected. Rendering is done by React components that map
 * these nodes to elements; nothing is ever injected as HTML.
 *
 * Strict objects mean content endpoints cannot carry verification, price or
 * clinical fields.
 */

export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

/** Control characters other than tab/newline, plus bidi overrides that can disguise text. */
function isUnsafeCodePoint(cp: number): boolean {
  return (
    (cp <= 0x1f && cp !== 0x09 && cp !== 0x0a) ||
    cp === 0x7f ||
    (cp >= 0x80 && cp <= 0x9f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

const hasUnsafeChars = (value: string): boolean => Array.from(value).some((ch) => isUnsafeCodePoint(ch.codePointAt(0) ?? 0));
// Any tag-like construct: <tag, </tag, <!--, <!doctype, <?xml
const HTML_TAG = /<\s*[a-zA-Z!/?]/;
// Entity-encoded markup or numeric entities used to smuggle tags.
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-f]+|lt|gt|quot|apos|amp);/i;
const SCRIPT_SCHEME = /(?:javascript|vbscript)\s*:/i;

/**
 * Normalizes rich-text leaf text: NFC, newlines, strip control/bidi-override
 * characters. Does NOT trim: inline nodes carry meaningful spaces
 * ("Hello " + bold "world" + " today").
 */
export function sanitizeLeafText(value: string): string {
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n");
  return Array.from(normalized)
    .filter((ch) => !isUnsafeCodePoint(ch.codePointAt(0) ?? 0))
    .join("");
}

/** Normalizes a whole field (title, summary, question): leaf sanitizing plus trim. */
export function sanitizeText(value: string): string {
  return sanitizeLeafText(value).trim();
}

export function containsMarkup(value: string): boolean {
  return HTML_TAG.test(value) || HTML_ENTITY.test(value) || SCRIPT_SCHEME.test(value);
}

/** Plain text field: sanitized, bounded, and rejected if it contains markup. */
export const plainText = (max: number, min = 1) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(min).max(max))
    .refine((v) => !containsMarkup(v), { message: "html_forbidden" });

/** Internal path ("/en/faq") or https URL. No protocol-relative, javascript:, data: or credentials. */
export const safeHref = z
  .string()
  .trim()
  .max(500)
  .refine((href) => {
    if (/[\s<>"'`\\]/.test(href) || hasUnsafeChars(href)) return false;
    if (href.startsWith("/")) return !href.startsWith("//");
    try {
      const url = new URL(href);
      return url.protocol === "https:" && url.username === "" && url.password === "";
    } catch {
      return false;
    }
  }, { message: "unsafe_href" });

/**
 * Rich-text leaf: sanitized but not trimmed, so spaces between inline nodes
 * survive. A leaf may be whitespace only; emptiness is checked per block.
 */
export const richTextLeaf = (max: number) =>
  z
    .string()
    .transform(sanitizeLeafText)
    .pipe(z.string().min(1).max(max))
    .refine((v) => !containsMarkup(v), { message: "html_forbidden" });

const textNode = z.strictObject({
  type: z.literal("text"),
  text: richTextLeaf(2000),
  marks: z.array(z.enum(["bold", "italic"])).max(2).refine((m) => new Set(m).size === m.length).optional(),
});

const linkNode = z.strictObject({
  type: z.literal("link"),
  href: safeHref,
  children: z.array(textNode).min(1).max(20),
});

export const inlineNode = z.discriminatedUnion("type", [textNode, linkNode]);

const visibleText = (nodes: readonly z.infer<typeof inlineNode>[]): boolean =>
  nodes.some((n) => (n.type === "text" ? n.text : n.children.map((c) => c.text).join("")).trim().length > 0);

/** A block's inline run must contain some visible text (individual leaves may be spaces). */
const inlines = z.array(inlineNode).min(1).max(100).refine(visibleText, { message: "empty_block" });

export const blockNode = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("paragraph"), children: inlines }),
  z.strictObject({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), children: inlines }),
  z.strictObject({ type: z.literal("list"), style: z.enum(["bullet", "ordered"]), items: z.array(inlines).min(1).max(50) }),
]);

export const richTextDoc = z.strictObject({
  type: z.literal("doc"),
  blocks: z.array(blockNode).min(1).max(200),
});

export type RichTextDoc = z.infer<typeof richTextDoc>;
export type RichTextBlock = z.infer<typeof blockNode>;
export type RichTextInline = z.infer<typeof inlineNode>;

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const localeSchema = z.enum(LOCALES);

const storyOrPage = {
  slug: slugSchema,
  locale: localeSchema,
  title: plainText(160),
  summary: plainText(400, 0),
  body: richTextDoc,
  /** Consent evidence reference for stories featuring a person (FE spec 15). */
  consentEvidenceId: z.string().min(1).max(64).nullable(),
  /**
   * Explicit attestation that the story shows no identifiable person. A story
   * can be published only with consent evidence OR this attestation (R-E14).
   */
  noIdentifiablePerson: z.boolean().default(false),
};

/** Draft input. Discriminated by kind; extra keys (price, verification, clinical) are rejected. */
export const contentDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("story"), ...storyOrPage }),
  z.strictObject({ kind: z.literal("page"), ...storyOrPage, consentEvidenceId: z.null() }),
  z.strictObject({
    kind: z.literal("faq"),
    slug: slugSchema,
    locale: localeSchema,
    question: plainText(300),
    answer: richTextDoc,
    order: z.number().int().min(0).max(10_000),
  }),
]);

export type ContentDraftInput = z.infer<typeof contentDraftSchema>;
