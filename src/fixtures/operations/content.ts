import type { ContentEntry, RichTextDoc } from "@/modules/content/types";
import { SYNTHETIC_MARKER } from "./guard";

/**
 * SYNTHETIC CMS entries. Placeholder copy only: no real people, testimonials,
 * outcomes, ratings or claims. Telugu/Hindi entries are labelled as fixtures and
 * are not reviewed translations.
 */

const doc = (text: string): RichTextDoc => ({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text }] }] });

const story: ContentEntry = {
  id: "fx-cms-story-1",
  kind: "story",
  slug: "synthetic-story-one",
  locales: {
    en: {
      locale: "en",
      working: {
        revision: 2,
        state: "draft",
        content: { kind: "story", title: "Synthetic story one (revised draft)", summary: "Fixture text for layout testing.", body: doc("Revised fixture paragraph. Not a real account."), consentEvidenceId: "fx-consent-1", noIdentifiablePerson: false },
        updatedAt: "2026-11-19T06:00:00Z",
      },
      published: {
        revision: 1,
        content: { kind: "story", title: "Synthetic story one", summary: "Fixture text for layout testing.", body: doc("Fixture paragraph. Not a real account."), consentEvidenceId: "fx-consent-1", noIdentifiablePerson: false },
        publishedAt: "2026-11-18T06:00:00Z",
      },
      history: [
        { revision: 1, state: "draft", editedByProfileId: "fx-adm-editor", editedAt: "2026-11-18T04:00:00Z", publishedByProfileId: null, publishedAt: null },
        { revision: 1, state: "in_preview", editedByProfileId: "fx-adm-editor", editedAt: "2026-11-18T05:00:00Z", publishedByProfileId: null, publishedAt: null },
        { revision: 1, state: "published", editedByProfileId: "fx-adm-publisher", editedAt: "2026-11-18T06:00:00Z", publishedByProfileId: "fx-adm-publisher", publishedAt: "2026-11-18T06:00:00Z" },
        { revision: 2, state: "draft", editedByProfileId: "fx-adm-editor", editedAt: "2026-11-19T06:00:00Z", publishedByProfileId: null, publishedAt: null },
      ],
      version: 5,
    },
  },
};

const faq: ContentEntry = {
  id: "fx-cms-faq-1",
  kind: "faq",
  slug: "synthetic-faq-booking",
  locales: {
    en: {
      locale: "en",
      working: { revision: 1, state: "published", content: { kind: "faq", question: "Synthetic question: how does a request work?", answer: doc("Fixture answer. A provider reviews and accepts each request manually."), order: 1 }, updatedAt: "2026-11-18T06:00:00Z" },
      published: { revision: 1, content: { kind: "faq", question: "Synthetic question: how does a request work?", answer: doc("Fixture answer. A provider reviews and accepts each request manually."), order: 1 }, publishedAt: "2026-11-18T06:00:00Z" },
      history: [{ revision: 1, state: "published", editedByProfileId: "fx-adm-publisher", editedAt: "2026-11-18T06:00:00Z", publishedByProfileId: "fx-adm-publisher", publishedAt: "2026-11-18T06:00:00Z" }],
      version: 3,
    },
    hi: {
      locale: "hi",
      working: { revision: 1, state: "in_preview", content: { kind: "faq", question: "[fixture hi] Synthetic question", answer: doc("[fixture hi] Synthetic answer, translation not reviewed."), order: 1 }, updatedAt: "2026-11-19T06:00:00Z" },
      published: null,
      history: [{ revision: 1, state: "in_preview", editedByProfileId: "fx-adm-editor", editedAt: "2026-11-19T06:00:00Z", publishedByProfileId: null, publishedAt: null }],
      version: 2,
    },
  },
};

const page: ContentEntry = {
  id: "fx-cms-page-1",
  kind: "page",
  slug: "synthetic-service-notice",
  locales: {
    en: {
      locale: "en",
      working: { revision: 1, state: "draft", content: { kind: "page", title: "Synthetic service notice", summary: "", body: doc("Fixture notice body."), consentEvidenceId: null, noIdentifiablePerson: false }, updatedAt: "2026-11-19T07:00:00Z" },
      published: null,
      history: [{ revision: 1, state: "draft", editedByProfileId: "fx-adm-editor", editedAt: "2026-11-19T07:00:00Z", publishedByProfileId: null, publishedAt: null }],
      version: 1,
    },
  },
};

export const contentFixtures = { ...SYNTHETIC_MARKER, entries: [story, faq, page] };
