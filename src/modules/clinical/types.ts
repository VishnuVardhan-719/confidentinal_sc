import { z } from "zod";
import { AMENDMENT_REASONS, clinicalDraftContentSchema } from "./schemas";

/**
 * Response DTOs for the PROPOSED consultation contracts (docs/API_CONTRACTS.md, Clinical/PDF rows).
 * Shapes are frontend proposals until the backend publishes them; mismatches are logged in
 * docs/frontend/REQUESTS.md. The http adapter rejects any response that does not match.
 */

export const CONSULTATION_STATUSES = ["draft", "final"] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

const isoTime = z.iso.datetime({ offset: true });

export const draftSnapshotSchema = z.strictObject({
  consultationId: z.string().min(1),
  bookingId: z.string().min(1),
  status: z.literal("draft"),
  version: z.number().int().nonnegative(),
  savedAt: isoTime.nullable(),
  content: clinicalDraftContentSchema,
});
export type DraftSnapshot = z.infer<typeof draftSnapshotSchema>;

export const saveDraftResponseSchema = z.strictObject({
  version: z.number().int().positive(),
  savedAt: isoTime,
});
export type SaveDraftResponse = z.infer<typeof saveDraftResponseSchema>;

/** Server-attributed signer. Never taken from client input. */
export const signerSchema = z.strictObject({
  clinicianId: z.string().min(1),
  displayName: z.string().min(1),
  registrationLabel: z.string().nullable(),
});

export const amendmentRecordSchema = z.strictObject({
  version: z.number().int().positive(),
  previousVersion: z.number().int().positive(),
  reason: z.enum(AMENDMENT_REASONS),
  reasonText: z.string(),
  amendedAt: isoTime,
  amendedBy: signerSchema,
});
export type AmendmentRecord = z.infer<typeof amendmentRecordSchema>;

export const signedVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  signedAt: isoTime,
  signedBy: signerSchema,
  content: clinicalDraftContentSchema,
});
export type SignedVersion = z.infer<typeof signedVersionSchema>;

/** A finalized consultation: immutable versions, append-only amendments. */
export const signedConsultationSchema = z.strictObject({
  consultationId: z.string().min(1),
  bookingId: z.string().min(1),
  bookingReference: z.string().min(1),
  status: z.literal("final"),
  /** Latest signed version number (== last entry of versions). */
  currentVersion: z.number().int().positive(),
  versions: z.array(signedVersionSchema).min(1),
  amendments: z.array(amendmentRecordSchema),
});
export type SignedConsultation = z.infer<typeof signedConsultationSchema>;

export const consultationSchema = z.discriminatedUnion("status", [draftSnapshotSchema, signedConsultationSchema]);
export type Consultation = z.infer<typeof consultationSchema>;

export const finalizeResponseSchema = signedConsultationSchema;

export const pdfLinkSchema = z.strictObject({
  consultationId: z.string().min(1),
  /** Signed version the PDF was rendered from. */
  version: z.number().int().positive(),
  /** Short-lived signed URL. Never logged, cached or sent to telemetry. */
  url: z.url(),
  expiresAt: isoTime,
});
export type PdfLink = z.infer<typeof pdfLinkSchema>;

export const latestSigned = (c: SignedConsultation): SignedVersion => c.versions[c.versions.length - 1];
