import { describe, expect, it } from "vitest";
import {
  canEditOnboarding,
  isBookableStatus,
  parseProviderStatus,
  presentProviderStatus,
  PROVIDER_STATUS_PRESENTATION,
  PROVIDER_STATUSES,
  providerStatusFromServer,
} from "@/modules/verification/status";
import { adminReviewSchema, allowedDecisions } from "@/modules/verification/schemas";

describe("provider status mapping", () => {
  it("has a label key and tone for every status plus unknown", () => {
    for (const s of [...PROVIDER_STATUSES, "unknown" as const]) {
      expect(PROVIDER_STATUS_PRESENTATION[s].labelKey).toBe(`onboarding.providerStatus.${s}`);
    }
    expect(presentProviderStatus("active").tone).toBe("success");
    expect(presentProviderStatus("suspended").tone).toBe("danger");
    expect(presentProviderStatus("changes_required").tone).toBe("warning");
  });

  it("unknown server values never become active", () => {
    for (const raw of ["ACTIVE", "verified", "live", "", null, undefined, 1, { status: "active" }]) {
      expect(parseProviderStatus(raw)).toBe("unknown");
    }
    expect(providerStatusFromServer({ verificationState: "something_new", operationalStatus: "active" })).toBe("unknown");
    expect(providerStatusFromServer({ verificationState: "active", operationalStatus: "active" })).toBe("unknown");
    expect(isBookableStatus("unknown")).toBe(false);
  });

  it("derives active only from approved + active (I02 pair)", () => {
    expect(providerStatusFromServer({ verificationState: "approved", operationalStatus: "active" })).toBe("active");
    expect(providerStatusFromServer({ verificationState: "approved", operationalStatus: "inactive" })).toBe("approved");
    expect(providerStatusFromServer({ verificationState: "approved", operationalStatus: "weird" })).toBe("approved");
    expect(providerStatusFromServer({ verificationState: "submitted", operationalStatus: "active" })).toBe("submitted");
    expect(providerStatusFromServer({ verificationState: "approved", operationalStatus: "suspended" })).toBe("suspended");
    expect(providerStatusFromServer({ verificationState: "under_review", operationalStatus: "inactive" })).toBe("under_review");
    expect(isBookableStatus("approved")).toBe(false);
    expect(isBookableStatus("active")).toBe(true);
  });

  it("editability follows I02 (draft/rejected) plus proposed changes_required", () => {
    expect(canEditOnboarding("draft")).toBe(true);
    expect(canEditOnboarding("rejected")).toBe(true);
    expect(canEditOnboarding("changes_required")).toBe(true);
    for (const s of ["submitted", "under_review", "approved", "active", "suspended", "expired", "unknown"] as const) {
      expect(canEditOnboarding(s)).toBe(false);
    }
  });
});

describe("admin review", () => {
  it("requires decision, non-blank reason and expected version", () => {
    expect(adminReviewSchema.safeParse({ decision: "approve", reason: "Evidence checked", expectedVersion: 3 }).success).toBe(true);
    expect(adminReviewSchema.safeParse({ decision: "approve", reason: "  ", expectedVersion: 3 }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ decision: "approve", reason: "ok", expectedVersion: 0 }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ decision: "approved", reason: "ok", expectedVersion: 1 }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ decision: "suspend", reason: "ok", expectedVersion: 1, reviewerId: "x" }).success).toBe(false);
  });

  it("offers decisions only from valid states", () => {
    expect(allowedDecisions("under_review")).toEqual(["approve", "reject", "changes_required"]);
    expect(allowedDecisions("active")).toEqual(["suspend"]);
    expect(allowedDecisions("submitted")).toEqual([]);
    expect(allowedDecisions("unknown")).toEqual([]);
  });
});
