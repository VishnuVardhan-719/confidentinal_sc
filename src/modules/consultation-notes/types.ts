import { z } from "zod";

/**
 * Doctor consultation notes for a COMPLETED booking: a short visit write-up the doctor drafts and
 * then signs off. Not the clinical record (modules/clinical) and not production-clinical: fixture
 * only, behind FEATURE_CLINICAL. Drafts live on the server only; nothing is autosaved or kept in
 * browser storage.
 */
export const NOTE_STATUSES = ["draft", "signed_off"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const NOTE_SECTIONS = ["summary", "findings", "advice", "followUp"] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];

/** Sections required before sign-off (drafts may be partial). */
export const REQUIRED_FOR_SIGN_OFF: readonly NoteSection[] = ["summary", "advice"];

export const NOTE_SECTION_MAX = 4000;

const isoTime = z.iso.datetime({ offset: true });
const sectionText = z.string().max(NOTE_SECTION_MAX);

export const noteSectionsSchema = z.strictObject({
  summary: sectionText,
  findings: sectionText,
  advice: sectionText,
  followUp: sectionText,
});
export type NoteSections = z.infer<typeof noteSectionsSchema>;

export const EMPTY_SECTIONS: NoteSections = { summary: "", findings: "", advice: "", followUp: "" };

export const consultationNoteSchema = z.strictObject({
  bookingId: z.string().min(1),
  status: z.enum(NOTE_STATUSES),
  /** Optimistic-concurrency version; every save/sign-off must send the version it started from. */
  version: z.number().int().positive(),
  sections: noteSectionsSchema,
  updatedAt: isoTime,
  signedOffAt: isoTime.nullable(),
  signedOffBy: z.strictObject({ displayName: z.string().min(1) }).nullable(),
});
export type ConsultationNote = z.infer<typeof consultationNoteSchema>;

export const saveNoteInputSchema = z.strictObject({
  /** 0 when no note exists yet. */
  expectedVersion: z.number().int().nonnegative(),
  sections: noteSectionsSchema,
});
export type SaveNoteInput = z.infer<typeof saveNoteInputSchema>;

export const signOffInputSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  attest: z.literal(true),
});
export type SignOffInput = z.infer<typeof signOffInputSchema>;

/** Trimmed-empty required sections, in display order. */
export function missingForSignOff(sections: NoteSections): NoteSection[] {
  return REQUIRED_FOR_SIGN_OFF.filter((s) => sections[s].trim() === "");
}
