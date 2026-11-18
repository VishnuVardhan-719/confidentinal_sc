import type { HealthFactVersion, HealthFactView, ProofOfVisit, ProofState, PublicProofView } from "./types";

/**
 * DC11: a fact may be shown as "Doctor verified" only when the server says a clinician verified
 * it AND supplies verifier attribution and reviewed evidence. A bare source flag is not enough.
 */
export function isDoctorVerified(v: HealthFactVersion): boolean {
  return v.source === "doctor_verified" && v.verifier !== null && !!v.verifier.displayName && !!v.evidenceNote?.trim();
}

export type FactBadge = "doctor_verified" | "patient_entered" | "unverified_claim";

/** Badge to render. A doctor_verified source missing attribution/evidence is flagged, not trusted. */
export function factBadge(fact: HealthFactView): FactBadge {
  if (isDoctorVerified(fact.current)) return "doctor_verified";
  return fact.current.source === "doctor_verified" ? "unverified_claim" : "patient_entered";
}

/** DC12 proof token lifecycle state at `now`. Revocation wins over expiry. */
export function proofState(p: ProofOfVisit, now: Date): ProofState {
  if (p.revokedAt) return "revoked";
  return Date.parse(p.expiresAt) <= now.getTime() ? "expired" : "active";
}

/** Keys a public proof view may contain. Used to test that nothing else leaks. */
export const PUBLIC_PROOF_ALLOWED_KEYS: ReadonlySet<string> = new Set(["status", "serviceDate", "serviceCategory", "providerDisplayName"]);

export function isMinimalPublicProof(v: PublicProofView): boolean {
  return Object.keys(v).every((k) => PUBLIC_PROOF_ALLOWED_KEYS.has(k));
}
