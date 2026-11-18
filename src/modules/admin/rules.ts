import { z } from "zod";
import { FEATURE_FLAGS, isEnabled } from "@/lib/feature-flags";
import { ADMIN_CAPABILITIES, can, type AdminPrincipal } from "./capabilities";
import type {
  AdminSettingsView,
  CoverageArea,
  CoverageDecision,
  ProviderReviewDetail,
  ProviderReviewFilter,
  ProviderReviewQueueItem,
  ReviewDecision,
  VerificationState,
} from "./types";

// ---------------------------------------------------------------------------
// Provider review (mirrors I02 review_provider)
// ---------------------------------------------------------------------------

const REVIEW_TRANSITIONS: Record<ReviewDecision, readonly VerificationState[]> = {
  under_review: ["submitted", "suspended"],
  approved: ["under_review"],
  rejected: ["under_review"],
  suspended: ["approved"],
};

export function allowedReviewDecisions(state: VerificationState): ReviewDecision[] {
  return (Object.keys(REVIEW_TRANSITIONS) as ReviewDecision[]).filter((d) => REVIEW_TRANSITIONS[d].includes(state));
}

export const reviewReasonSchema = z.string().trim().min(1).max(1000);

export const providerReviewBodySchema = z.strictObject({
  decision: z.enum(["under_review", "approved", "rejected", "suspended"]),
  reason: reviewReasonSchema,
  expectedVersion: z.number().int().positive().max(2_147_483_646),
});

export type ReviewDenial = "no_capability" | "self_approval" | "invalid_transition" | "reason_required";

/**
 * Decides whether an admin may record a provider review decision.
 * No self-approval: a reviewer who owns, manages or uploaded documents for
 * the application is denied for every decision (I02 rule).
 */
export function reviewDecisionDenial(
  admin: AdminPrincipal | null | undefined,
  detail: Pick<ProviderReviewDetail, "verificationState" | "applicantProfileIds" | "organizationId">,
  decision: ReviewDecision,
  reason: string,
  now: Date = new Date(),
): ReviewDenial | null {
  if (!can(admin, "provider:verify", { now })) return "no_capability";
  if (admin && detail.applicantProfileIds.includes(admin.profileId)) return "self_approval";
  if (!REVIEW_TRANSITIONS[decision].includes(detail.verificationState)) return "invalid_transition";
  if (!reviewReasonSchema.safeParse(reason).success) return "reason_required";
  return null;
}

export function filterProviderReviews(items: readonly ProviderReviewQueueItem[], filter: ProviderReviewFilter): ProviderReviewQueueItem[] {
  const before = filter.expiringBefore === undefined ? null : Date.parse(filter.expiringBefore);
  return items.filter((item) => {
    if (filter.category !== undefined && item.category !== filter.category) return false;
    if (filter.state !== undefined && item.verificationState !== filter.state) return false;
    if (before !== null) {
      if (item.earliestDocumentExpiry === null) return false;
      if (!(Date.parse(item.earliestDocumentExpiry) < before)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Coverage (mirrors C01 review_service_area)
// ---------------------------------------------------------------------------

export const pinSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/);

const COVERAGE_TRANSITIONS: Record<CoverageDecision, readonly CoverageArea["status"][]> = {
  approved: ["proposed"],
  rejected: ["proposed"],
  revoked: ["approved"],
};

export type CoverageDenial = "no_capability" | "invalid_transition" | "reason_required" | "valid_until_required";

export function coverageDecisionDenial(
  admin: AdminPrincipal | null | undefined,
  area: Pick<CoverageArea, "status">,
  decision: CoverageDecision,
  reason: string,
  validUntil: string | undefined,
  now: Date = new Date(),
): CoverageDenial | null {
  if (!can(admin, "coverage:verify", { now })) return "no_capability";
  if (!COVERAGE_TRANSITIONS[decision].includes(area.status)) return "invalid_transition";
  if (!reviewReasonSchema.safeParse(reason).success) return "reason_required";
  if (decision === "approved") {
    const until = validUntil === undefined ? NaN : Date.parse(validUntil);
    const max = new Date(now);
    max.setUTCFullYear(max.getUTCFullYear() + 1);
    if (!Number.isFinite(until) || until <= now.getTime() || until > max.getTime()) return "valid_until_required";
  }
  return null;
}

/**
 * A provider is publicly bookable for a PIN only when the provider is approved
 * and the exact PIN area is approved and inside its validity window.
 */
export function isBookableCoverage(
  providerState: VerificationState,
  area: Pick<CoverageArea, "status" | "validFrom" | "validTo">,
  now: Date = new Date(),
): boolean {
  if (providerState !== "approved" || area.status !== "approved") return false;
  const t = now.getTime();
  const from = area.validFrom === null ? -Infinity : Date.parse(area.validFrom);
  const to = area.validTo === null ? NaN : Date.parse(area.validTo);
  return Number.isFinite(to) && t >= from && t < to;
}

// ---------------------------------------------------------------------------
// Booking operations (read-only)
// ---------------------------------------------------------------------------

/** Normalizes a pasted booking reference to `#SCV-BKG-000000`, or null if invalid. Never searches free text. */
export function normalizeBookingReference(input: string): string | null {
  const match = /^#?\s*SCV-BKG-(\d{6})$/i.exec(input.trim());
  return match ? `#SCV-BKG-${match[1]}` : null;
}

// ---------------------------------------------------------------------------
// Staff/admin access
// ---------------------------------------------------------------------------

export const adminInviteSchema = z.strictObject({
  email: z.email().max(254),
  capabilities: z.array(z.enum(ADMIN_CAPABILITIES)).min(1).refine((c) => new Set(c).size === c.length),
  scope: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("global") }),
    z.strictObject({ kind: z.literal("organization"), organizationId: z.string().min(1).max(64) }),
  ]),
});

/** Admin access changes need membership:admin and never target the actor's own grants (no self-granted admin). */
export function canManageAdmin(actor: AdminPrincipal | null | undefined, targetProfileId: string, now: Date = new Date()): boolean {
  return can(actor, "membership:admin", { now }) && actor !== null && actor !== undefined && actor.profileId !== targetProfileId;
}

// ---------------------------------------------------------------------------
// Settings: read-only gate display
// ---------------------------------------------------------------------------

export function gateSettings(env: Record<string, string | undefined> = process.env): AdminSettingsView {
  return {
    gates: FEATURE_FLAGS.map((flag) => ({
      flag,
      enabled: isEnabled(flag, env),
      editable: false as const,
      labelKey: `admin.settings.gate.${flag}`,
    })),
  };
}
