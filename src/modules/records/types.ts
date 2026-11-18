import { z } from "zod";
import type { PaymentStateRef } from "@/modules/doctor/types";
import { signedConsultationSchema, type SignedConsultation } from "@/modules/clinical/types";

const isoTime = z.iso.datetime({ offset: true });

// ---- DC09 patient-visible records ---------------------------------------------------------
/** Patient record list item. Only signed/final records ever appear; drafts are never listed. */
export const patientRecordSummarySchema = z.strictObject({
  consultationId: z.string().min(1),
  bookingReference: z.string().min(1),
  visitAt: isoTime,
  doctorDisplayName: z.string().min(1),
  currentVersion: z.number().int().positive(),
  lastSignedAt: isoTime,
  amended: z.boolean(),
});
export type PatientRecordSummary = z.infer<typeof patientRecordSummarySchema>;
/** Detail is the same signed source as the PDF, never a draft. */
export const patientRecordDetailSchema = signedConsultationSchema;
export type PatientRecordDetail = SignedConsultation;

// ---- DC10 collection (pay-after) ------------------------------------------------------------
export const COLLECTION_METHODS = ["cash", "upi_direct"] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

/**
 * Provider-recorded collection. Independent of clinical finalization and of gateway payments:
 * recording cash/direct UPI never marks a gateway payment as PAID.
 */
export const collectionInputSchema = z
  .strictObject({
    method: z.enum(COLLECTION_METHODS),
    /** Integer paise, server re-validates against the booking snapshot. */
    amountPaise: z.number().int().positive().max(100_000_000),
    /** UPI transaction reference or receipt note; required for UPI. */
    reference: z.string().trim().max(64).regex(/^[A-Za-z0-9 _/-]*$/).optional(),
  })
  .refine((v) => v.method !== "upi_direct" || (v.reference ?? "").length > 0, { path: ["reference"], error: "required" });
export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const collectionRecordSchema = z.strictObject({
  bookingId: z.string().min(1),
  method: z.enum(COLLECTION_METHODS),
  amountPaise: z.number().int().positive(),
  reference: z.string().nullable(),
  collectedAt: isoTime,
  recordedByDisplayName: z.string().min(1),
});
export type CollectionRecord = z.infer<typeof collectionRecordSchema>;

export const COLLECTION_STATUSES = ["not_recorded", "recorded"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export type CollectionView = {
  bookingId: string;
  status: CollectionStatus;
  record: CollectionRecord | null;
  /** Separate payment badge (payments module owns the canonical map). */
  paymentState: PaymentStateRef;
  /** Snapshot amount due in paise, from server. */
  amountDuePaise: number;
};

// ---- DC11 health facts ---------------------------------------------------------------------
export const HEALTH_FACT_KINDS = ["blood_group", "height", "weight", "allergy", "condition", "medicine", "surgery", "note"] as const;
export type HealthFactKind = (typeof HEALTH_FACT_KINDS)[number];
export const HEALTH_FACT_SOURCES = ["patient_entered", "doctor_verified"] as const;
export type HealthFactSource = (typeof HEALTH_FACT_SOURCES)[number];

export type HealthFactVersion = {
  version: number;
  value: string;
  source: HealthFactSource;
  recordedAt: string;
  verifier: { clinicianId: string; displayName: string } | null;
  evidenceNote: string | null;
  /** Present on clinician corrections: why the value changed. */
  correctionReason?: string | null;
};

export type HealthFactView = {
  factId: string;
  kind: HealthFactKind;
  current: HealthFactVersion;
  /** Earlier versions, newest first. Never rewritten. */
  history: HealthFactVersion[];
};

export const confirmFactsInputSchema = z.strictObject({
  /** Only facts the clinician actually reviewed. Entering a consultation verifies nothing. */
  facts: z.array(z.strictObject({ factId: z.string().min(1), expectedVersion: z.number().int().positive() })).min(1).max(50),
  evidenceNote: z.string().trim().min(3).max(1000),
  reviewAcknowledged: z.literal(true),
});
export type ConfirmFactsInput = z.infer<typeof confirmFactsInputSchema>;

/**
 * DC11 correction: the clinician records a different value. Appends a new attributed version;
 * the previous value stays in history. Reason and evidence are mandatory.
 */
export const correctFactInputSchema = z.strictObject({
  factId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  newValue: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(10).max(1000),
  evidenceNote: z.string().trim().min(3).max(1000),
  reviewAcknowledged: z.literal(true),
});
export type CorrectFactInput = z.infer<typeof correctFactInputSchema>;

// ---- DC12 proof of visit -------------------------------------------------------------------
/** Opaque token only. Never encodes patient ID, OTP, diagnosis or chart. */
export type ProofOfVisit = {
  token: string;
  bookingId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export const PROOF_STATES = ["active", "expired", "revoked"] as const;
export type ProofState = (typeof PROOF_STATES)[number];

/** Public verification result: minimal attendance confirmation, no identity/address/health data. */
export type PublicProofView =
  | { status: "valid"; serviceDate: string; serviceCategory: "doctor_visit"; providerDisplayName: string }
  | { status: "expired" | "revoked" | "not_found" };

export const proofTokenSchema = z.string().regex(/^[a-f0-9]{32}$/);

// ---- DC13 photo consent --------------------------------------------------------------------
export const PHOTO_CONSENT_DECISIONS = ["consent", "decline", "withdrawn"] as const;
export type PhotoConsentDecision = (typeof PHOTO_CONSENT_DECISIONS)[number];

export const photoConsentInputSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("consent"), purpose: z.string().trim().min(3).max(500), patientConfirmed: z.literal(true) }),
  z.strictObject({ decision: z.literal("decline") }),
  z.strictObject({ decision: z.literal("withdrawn") }),
]);
export type PhotoConsentInput = z.infer<typeof photoConsentInputSchema>;

export type PhotoConsent = {
  consultationId: string;
  decision: PhotoConsentDecision;
  purpose: string | null;
  decidedAt: string;
};

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Proposed client-side pre-check only; the server validates type/size again. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export const photoUploadInputSchema = z.strictObject({
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(PHOTO_MAX_BYTES),
});
export type PhotoUploadInput = z.infer<typeof photoUploadInputSchema>;

export const PHOTO_SCAN_STATUSES = ["pending", "clean", "rejected"] as const;
export type PhotoScanStatus = (typeof PHOTO_SCAN_STATUSES)[number];

/** Private upload metadata. No public URL; viewing needs a per-request authorized link. */
export type PhotoMeta = {
  photoId: string;
  consultationId: string;
  contentType: (typeof PHOTO_CONTENT_TYPES)[number];
  sizeBytes: number;
  uploadedAt: string;
  scanStatus: PhotoScanStatus;
  withdrawn: boolean;
};

export type PrivateFileLink = { url: string; expiresAt: string };

// ---- Proposed http DTOs (only those with a contracted route) --------------------------------
export const proofOfVisitSchema = z.strictObject({
  token: proofTokenSchema,
  bookingId: z.string().min(1),
  issuedAt: isoTime,
  expiresAt: isoTime,
  revokedAt: isoTime.nullable(),
});
