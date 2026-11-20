import { z } from "zod";
import { versionSchema } from "./booking";

// Each list must equal the CHECK of the same name in supabase/migrations/2026111700242*-244*
// (parity test in tests/unit/doctor-extras.test.ts).
export const FACT_KINDS = ["allergy", "condition", "medication", "procedure", "other"] as const;
export const FACT_OUTCOMES = ["confirmed", "not_confirmed"] as const;
export const EVIDENCE_KINDS = ["document_reviewed", "clinical_examination", "prior_clinical_record", "medication_inspected"] as const;
export const PHOTO_PURPOSES = ["wound_documentation", "skin_condition", "mobility_assessment"] as const;
export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

const statement = z.string().trim().min(1).max(200).regex(/^[^\p{Cc}]*$/u);

export const progressQuerySchema = z.strictObject({ afterVersion: z.coerce.number().int().min(0).max(2_147_483_646).default(0) });
export const factCreateSchema = z.strictObject({ kind: z.enum(FACT_KINDS), statement });
export const factReviseSchema = z.strictObject({ statement, expectedVersion: z.number().int().min(1).max(999) });
export const factVerifySchema = z.strictObject({
  factVersion: z.number().int().min(1).max(1000),
  bookingId: z.uuid(),
  outcome: z.enum(FACT_OUTCOMES),
  evidenceKind: z.enum(EVIDENCE_KINDS),
  // An identifier (document number, record reference), never prose.
  evidenceRef: z.string().regex(/^[A-Za-z0-9._:/-]{1,80}$/),
});
export const factListQuerySchema = z.strictObject({ bookingId: z.uuid().optional() });
// Hours; default 7 days, maximum 30 days (owner question DC12).
export const proofIssueSchema = z.strictObject({ ttlHours: z.number().int().min(1).max(720).default(168) });
export const proofVerifySchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const photoConsentSchema = z.strictObject({ purpose: z.enum(PHOTO_PURPOSES), policyVersion: z.string().trim().min(1).max(80) });
export const photoWithdrawSchema = z.strictObject({ expectedVersion: versionSchema });
export const photoRegisterSchema = z.strictObject({ consentId: z.uuid(), contentType: z.enum(PHOTO_TYPES) });
