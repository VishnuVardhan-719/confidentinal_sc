import { z } from "zod";

/**
 * Canonical provider status for UI display (FRONTEND_MASTER section 8).
 * `rejected` is added because I02 `providers.verification_state` has it and the admin
 * `reject` decision must land somewhere; recorded in docs/frontend/REQUESTS.md.
 * I02 does not yet emit `changes_required` or `expired`.
 */
export const PROVIDER_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "changes_required",
  "approved",
  "active",
  "rejected",
  "suspended",
  "expired",
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
export const providerStatusSchema = z.enum(PROVIDER_STATUSES);

/** Display value for anything the server sends that we do not recognise. Never treated as active. */
export type ProviderStatusDisplay = ProviderStatus | "unknown";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusPresentation = {
  /** Message key in the `onboarding` namespace. */
  labelKey: `onboarding.providerStatus.${ProviderStatusDisplay}`;
  tone: StatusTone;
};

export const PROVIDER_STATUS_PRESENTATION: Readonly<Record<ProviderStatusDisplay, StatusPresentation>> = {
  draft: { labelKey: "onboarding.providerStatus.draft", tone: "neutral" },
  submitted: { labelKey: "onboarding.providerStatus.submitted", tone: "info" },
  under_review: { labelKey: "onboarding.providerStatus.under_review", tone: "info" },
  changes_required: { labelKey: "onboarding.providerStatus.changes_required", tone: "warning" },
  approved: { labelKey: "onboarding.providerStatus.approved", tone: "success" },
  active: { labelKey: "onboarding.providerStatus.active", tone: "success" },
  rejected: { labelKey: "onboarding.providerStatus.rejected", tone: "danger" },
  suspended: { labelKey: "onboarding.providerStatus.suspended", tone: "danger" },
  expired: { labelKey: "onboarding.providerStatus.expired", tone: "warning" },
  unknown: { labelKey: "onboarding.providerStatus.unknown", tone: "neutral" },
};

const isProviderStatus = (value: unknown): value is ProviderStatus =>
  typeof value === "string" && (PROVIDER_STATUSES as readonly string[]).includes(value);

/** Parse a single status value. Anything unrecognised becomes `unknown`, never `active`. */
export function parseProviderStatus(raw: unknown): ProviderStatusDisplay {
  return isProviderStatus(raw) ? raw : "unknown";
}

/**
 * Derive display status from the I02 pair (`verification_state`, `status`).
 * `active` requires BOTH approved verification and active operational status.
 */
export function providerStatusFromServer(input: {
  verificationState: unknown;
  operationalStatus: unknown;
}): ProviderStatusDisplay {
  const verification = parseProviderStatus(input.verificationState);
  const operational = input.operationalStatus;
  if (operational === "suspended" || verification === "suspended") return "suspended";
  if (verification === "unknown") return "unknown";
  if (verification === "approved") return operational === "active" ? "active" : "approved";
  // An `active` verification_state is not a backend value; treat it as unknown rather than trust it.
  if (verification === "active") return "unknown";
  return verification;
}

export const presentProviderStatus = (status: ProviderStatusDisplay): StatusPresentation =>
  PROVIDER_STATUS_PRESENTATION[status];

/** Only an active provider may appear bookable. Server still decides via provider_is_publishable. */
export const isBookableStatus = (status: ProviderStatusDisplay): boolean => status === "active";

/** Provider may edit onboarding data (I02 allows edits in draft/rejected; changes_required is a proposed state). */
export const canEditOnboarding = (status: ProviderStatusDisplay): boolean =>
  status === "draft" || status === "rejected" || status === "changes_required";

export const canSubmitForReview = canEditOnboarding;
