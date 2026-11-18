import type { ProviderCategory } from "@/modules/auth/roles";
import { isBookableStatus, type ProviderStatusDisplay } from "@/modules/verification/status";
import type { DocumentKind } from "@/modules/verification/schemas";
import type { EvidenceView, ProviderOnboardingDraft } from "./provider";
import type { OnboardingCompletion } from "./steps";

/**
 * FRONTEND_MASTER s8: "Separate profile completeness, credential review, service activation,
 * availability, suspension and expiry." Each dimension is derived independently so the setup
 * dashboard never collapses them into one progress bar. Verification is not a checkbox.
 */

/** I02 `required_kind` per category. */
export const REQUIRED_EVIDENCE: Readonly<Record<ProviderCategory, DocumentKind>> = {
  doctor: "registration",
  lab: "licence",
  ambulance: "vehicle_permit",
  caretaker: "background_check",
};

export const EXPIRY_WARNING_DAYS = 30;

export type CredentialState = "missing" | "pending" | "verified" | "rejected" | "expiring_soon" | "expired";

export type ProviderReadiness = {
  profile: "complete" | "incomplete";
  credentials: CredentialState;
  /** Earliest expiry among live required evidence, for "renew by" messaging. */
  credentialExpiresAt: string | null;
  /** Availability section saved and valid (where the category has one). */
  availability: "set" | "not_set" | "not_applicable";
  review: ProviderStatusDisplay;
  activation: "active" | "inactive";
  suspended: boolean;
};

function credentialState(evidence: readonly EvidenceView[], required: DocumentKind, now: Date): { state: CredentialState; expiresAt: string | null } {
  const ofKind = evidence.filter((e) => e.kind === required && e.status !== "superseded");
  if (ofKind.length === 0) return { state: "missing", expiresAt: null };
  const live = ofKind.filter((e) => e.status === "pending" || e.status === "verified");
  if (live.length === 0) return { state: ofKind.some((e) => e.status === "rejected") ? "rejected" : "missing", expiresAt: null };
  const best = [...live].sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
  const expiresMs = Date.parse(best.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= now.getTime()) return { state: "expired", expiresAt: best.expiresAt };
  if (best.status === "pending") return { state: "pending", expiresAt: best.expiresAt };
  const days = (expiresMs - now.getTime()) / 86_400_000;
  return { state: days <= EXPIRY_WARNING_DAYS ? "expiring_soon" : "verified", expiresAt: best.expiresAt };
}

export function providerReadiness(
  draft: ProviderOnboardingDraft,
  completion: OnboardingCompletion<string>,
  now: Date = new Date(),
): ProviderReadiness {
  const credentials = credentialState(draft.evidence ?? [], REQUIRED_EVIDENCE[draft.category], now);
  const availabilityStep = completion.steps.find((s) => s.id === "availability");
  return {
    profile: completion.readyToSubmit ? "complete" : "incomplete",
    credentials: credentials.state,
    credentialExpiresAt: credentials.expiresAt,
    availability: availabilityStep ? (availabilityStep.state === "complete" ? "set" : "not_set") : "not_applicable",
    review: draft.status,
    activation: isBookableStatus(draft.status) ? "active" : "inactive",
    suspended: draft.status === "suspended",
  };
}
