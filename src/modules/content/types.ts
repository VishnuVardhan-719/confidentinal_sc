import type { Locale, RichTextDoc } from "./schema";

export type { Locale, RichTextDoc } from "./schema";

export type IsoUtc = string;
export type Page<T> = { items: T[]; nextCursor: string | null };

export type ContentKind = "story" | "faq" | "page";

/** Per-locale workflow: draft -> in_preview -> published; archived withdraws it. */
export type ContentState = "draft" | "in_preview" | "published" | "archived";

export type ContentAction = "submit_preview" | "return_to_draft" | "publish" | "archive";

/** Kind-specific body. Stories and pages share a shape; FAQ is question + answer. */
export type ContentBody =
  | { kind: "story" | "page"; title: string; summary: string; body: RichTextDoc; consentEvidenceId: string | null }
  | { kind: "faq"; question: string; answer: RichTextDoc; order: number };

export type ContentRevision = {
  revision: number;
  state: ContentState;
  editedByProfileId: string;
  editedAt: IsoUtc;
  publishedByProfileId: string | null;
  publishedAt: IsoUtc | null;
};

export type LocaleVersion = {
  locale: Locale;
  /** Working copy. Editing a published entry creates a new draft revision; the live one stays live. */
  working: { revision: number; state: ContentState; content: ContentBody; updatedAt: IsoUtc };
  /** Last published snapshot served to the public site, or null. */
  published: { revision: number; content: ContentBody; publishedAt: IsoUtc } | null;
  history: ContentRevision[];
  version: number;
};

export type ContentEntry = {
  id: string;
  kind: ContentKind;
  slug: string;
  locales: Partial<Record<Locale, LocaleVersion>>;
};

export type ContentListFilter = { kind?: ContentKind; state?: ContentState; locale?: Locale; cursor?: string };

export type ContentTransitionInput = {
  entryId: string;
  locale: Locale;
  action: ContentAction;
  expectedVersion: number;
  idempotencyKey: string;
};

// ---- Public read models (published only) -----------------------------------

export type PublicStory = {
  slug: string;
  /** Locale actually served. Differs from the requested locale only when falling back to en. */
  servedLocale: Locale;
  title: string;
  summary: string;
  body: RichTextDoc;
  publishedAt: IsoUtc;
};

export type PublicStorySummary = Omit<PublicStory, "body">;

export type PublicFaqItem = {
  slug: string;
  servedLocale: Locale;
  question: string;
  answer: RichTextDoc;
  order: number;
};
