import { z } from "zod";

/**
 * Public proof-of-visit check (DC12). A proof confirms only that a doctor visit took place: date,
 * service category and the doctor's public display name. Never the patient, address, OTP or any
 * health detail. Revoked and expired proofs say so; unknown and malformed codes look identical.
 */
export const PROOF_CHECK_STATUSES = ["valid", "expired", "revoked", "unknown"] as const;
export type ProofCheckStatus = (typeof PROOF_CHECK_STATUSES)[number];

/** Codes are 32 lowercase hex characters (128 random bits); the UI groups them by 4 for reading. */
export const PROOF_CODE_LENGTH = 32;
const CODE = /^[a-f0-9]{32}$/;

export const proofCheckResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("valid"),
    /** IST calendar date "YYYY-MM-DD". */
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceCategory: z.literal("doctor_visit"),
    providerDisplayName: z.string().min(1).max(120),
  }),
  z.strictObject({ status: z.enum(["expired", "revoked", "unknown"]) }),
]);
export type ProofCheckResult = z.infer<typeof proofCheckResultSchema>;

/**
 * Normalize what a person types or a link carries: drop spaces, hyphens and other separators,
 * lowercase. Returns null unless the result is a well-formed code (no lookup for anything else).
 */
export function normalizeProofCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 80) return null;
  const compact = input.replace(/[\s\-_.]/g, "").toLowerCase();
  return CODE.test(compact) ? compact : null;
}

/** "908f 8aae 6e00 ..." for display only. */
export const formatProofCode = (code: string): string => code.replace(/(.{4})(?=.)/g, "$1 ");

const CHECK_LOCALES = new Set(["en", "te", "hi"]);

/**
 * Relative Location for the /verify/check redirect (never built from the Host header). Valid code ->
 * /{locale}/verify/{code}; otherwise /{locale}/verify?error=required|invalid, echoing at most 80
 * characters of an invalid entry (already in the form's own URL) so the field can be refilled.
 */
export function proofCheckLocation(rawLocale: string, typed: string): string {
  const locale = CHECK_LOCALES.has(rawLocale) ? rawLocale : "en";
  const code = normalizeProofCode(typed);
  if (code) return `/${locale}/verify/${code}`;
  const q = new URLSearchParams({ error: typed.trim() === "" ? "required" : "invalid" });
  if (typed.trim() !== "") q.set("code", typed.slice(0, 80));
  return `/${locale}/verify?${q.toString()}`;
}
