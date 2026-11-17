import { z } from "zod";

/**
 * Request shapes for I02 provider onboarding and verification commands (contract v0).
 * These mirror the database RPC checks for early, friendly errors. The database stays the authority:
 * passing validation here never implies permission.
 */

export const providerCategories = ["doctor", "lab", "ambulance", "caretaker"] as const;
export const verificationStates = ["draft", "submitted", "approved", "rejected", "suspended", "expired"] as const;
export const documentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;

export const PROVIDER_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60;
export const MAX_VERIFICATION_DAYS = 365;

export const ProviderCategory = z.enum(providerCategories);
export const VerificationState = z.enum(verificationStates);
export const DocumentMimeType = z.enum(documentMimeTypes);

const ReasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const Message = z.string().max(500);
const Version = z.number().int().min(1);

export const CreateProviderInput = z
  .object({
    category: ProviderCategory,
    organizationId: z.uuid().nullable(),
    displayName: z.string().trim().min(1).max(160),
  })
  .refine((v) => v.category !== "lab" || v.organizationId !== null, {
    message: "Labs must be owned by an organization",
    path: ["organizationId"],
  });

export const RegisterProviderDocumentInput = z
  .object({
    providerId: z.uuid(),
    subjectProfileId: z.uuid().nullable(),
    documentType: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    mimeType: DocumentMimeType,
    sizeBytes: z.number().int().min(1).max(PROVIDER_DOCUMENT_MAX_BYTES),
    label: z.string().trim().max(80).optional(),
    issuedOn: z.iso.date().optional(),
    expiresOn: z.iso.date().optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((v) => !v.issuedOn || !v.expiresOn || v.expiresOn > v.issuedOn, {
    message: "Expiry must be after the issue date",
    path: ["expiresOn"],
  });

export const ConfirmProviderDocumentInput = z.object({
  documentId: z.uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const SubmitProviderVerificationInput = z.object({
  caseId: z.uuid(),
  /** Provider version for the provider-level case; case version for a staff credential case. */
  expectedVersion: Version,
  idempotencyKey: z.uuid(),
});

export const ReviewProviderDocumentInput = z
  .object({
    documentId: z.uuid(),
    decision: z.enum(["accepted", "rejected"]),
    reasonCode: ReasonCode.optional(),
    message: Message.optional(),
    expectedVersion: Version,
  })
  .refine((v) => v.decision !== "rejected" || v.reasonCode !== undefined, {
    message: "A rejection needs a reason code",
    path: ["reasonCode"],
  });

export const DecideProviderVerificationInput = z
  .object({
    caseId: z.uuid(),
    decision: z.enum(["approved", "rejected"]),
    reasonCode: ReasonCode.optional(),
    message: Message.optional(),
    verifiedUntil: z.iso.datetime({ offset: true }).optional(),
    expectedVersion: Version,
    idempotencyKey: z.uuid(),
  })
  .refine((v) => v.decision !== "rejected" || v.reasonCode !== undefined, {
    message: "A rejection needs a reason code",
    path: ["reasonCode"],
  })
  .refine((v) => v.decision !== "approved" || v.verifiedUntil !== undefined, {
    message: "An approval needs a validity end",
    path: ["verifiedUntil"],
  });

export const SuspendProviderInput = z.object({
  caseId: z.uuid(),
  reasonCode: ReasonCode,
  message: Message.optional(),
  expectedVersion: Version,
  idempotencyKey: z.uuid(),
});

export const ReinstateProviderInput = z.object({
  caseId: z.uuid(),
  message: Message.optional(),
  expectedVersion: Version,
  idempotencyKey: z.uuid(),
});

export const DocumentAccessInput = z.object({
  documentId: z.uuid(),
  purpose: z.enum(["owner_view", "admin_review"]),
});

export type ProviderCategory = z.infer<typeof ProviderCategory>;
export type VerificationState = z.infer<typeof VerificationState>;
export type CreateProviderInput = z.infer<typeof CreateProviderInput>;
export type RegisterProviderDocumentInput = z.infer<typeof RegisterProviderDocumentInput>;
export type ConfirmProviderDocumentInput = z.infer<typeof ConfirmProviderDocumentInput>;
export type SubmitProviderVerificationInput = z.infer<typeof SubmitProviderVerificationInput>;
export type ReviewProviderDocumentInput = z.infer<typeof ReviewProviderDocumentInput>;
export type DecideProviderVerificationInput = z.infer<typeof DecideProviderVerificationInput>;
export type SuspendProviderInput = z.infer<typeof SuspendProviderInput>;
export type ReinstateProviderInput = z.infer<typeof ReinstateProviderInput>;
export type DocumentAccessInput = z.infer<typeof DocumentAccessInput>;
