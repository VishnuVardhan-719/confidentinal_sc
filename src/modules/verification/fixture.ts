import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { FIXTURE_COVERAGE_AREAS, FIXTURE_REVIEW_DETAILS } from "@/fixtures/identity";
import { assertFixtureAllowed, type FixtureOptions } from "@/modules/auth/fixture-guard";
import { validateInput } from "@/modules/auth/http-client";
import type { VerificationApi } from "./api";
import {
  adminReviewSchema,
  allowedDecisions,
  canStartReview,
  startReviewSchema,
  type DocumentKind,
  type ProviderReviewDetail,
  type ReviewDecision,
} from "./schemas";
import type { ProviderStatus, ProviderStatusDisplay } from "./status";
import {
  allowedCoverageDecisions,
  coverageDecisionSchema,
  coverageFilterSchema,
  matchesExpiryWindow,
  reviewQueueFilterSchema,
  type CoverageArea,
  type CoverageDecision,
  type CoverageState,
} from "./queries";

const COVERAGE_RESULT: Readonly<Record<CoverageDecision, CoverageState>> = {
  approve: "approved",
  reject: "rejected",
  revoke: "revoked",
};

/** Synthetic VerificationApi mirroring I02 transition rules. Never issues document URLs. */

const DECISION_RESULT: Readonly<Record<ReviewDecision, ProviderStatus>> = {
  // I02 approval also activates the provider when it is publishable.
  approve: "active",
  reject: "rejected",
  changes_required: "changes_required",
  suspend: "suspended",
};

const REQUIRED_KIND: Readonly<Record<ProviderReviewDetail["category"], DocumentKind>> = {
  doctor: "registration",
  lab: "licence",
  ambulance: "vehicle_permit",
  caretaker: "background_check",
};

const uuid = z.uuid();

export type FixtureVerificationStore = {
  providers: Map<string, ProviderReviewDetail>;
  coverage: Map<string, CoverageArea>;
};

export const createFixtureVerificationStore = (): FixtureVerificationStore => ({
  providers: new Map(FIXTURE_REVIEW_DETAILS.map((d) => [d.providerId, structuredClone(d)])),
  coverage: new Map(FIXTURE_COVERAGE_AREAS.map((a) => [a.areaId, structuredClone(a)])),
});

/** Dev-server process memory so review decisions persist across requests in fixture mode. */
let sharedStore: FixtureVerificationStore | null = null;

/**
 * Review status the synthetic admin has set for a provider, or null when no decision store exists yet
 * (nothing reviewed in this process). The fixture auth adapter reads it so an admin approval opens the
 * provider's dashboard on their next sign-in, exactly as the real backend derives workspace state.
 */
export const fixtureReviewStatus = (providerId: string): ProviderStatusDisplay | null => sharedStore?.providers.get(providerId)?.status ?? null;

/**
 * A provider application submitted through the fixture onboarding API joins the admin's review queue, exactly
 * as a real submission would. Existing records are left alone so an admin decision is never overwritten.
 */
export function fixtureRegisterSubmission(record: ProviderReviewDetail): void {
  const store = (sharedStore ??= createFixtureVerificationStore());
  if (!store.providers.has(record.providerId)) store.providers.set(record.providerId, structuredClone(record));
}

export function createFixtureVerificationApi(options: FixtureOptions & { store?: FixtureVerificationStore } = {}): VerificationApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  const store = options.store ?? (sharedStore ??= createFixtureVerificationStore());
  const records = store.providers;

  /** Read the clock once, BEFORE any mutation; an invalid clock aborts without side effects. */
  function stamp(): string | null {
    try {
      return now().toISOString();
    } catch {
      return null;
    }
  }

  function transition(record: ProviderReviewDetail, to: ProviderStatus, reason: string, occurredAt: string) {
    const from = record.status;
    record.status = to;
    record.version += 1;
    record.events.unshift({ fromState: from, toState: to, publicReason: reason, providerVersion: record.version, occurredAt });
    return ok({ providerId: record.providerId, status: record.status, version: record.version });
  }

  return {
    async listReviewQueue(filter = {}) {
      const valid = validateInput(reviewQueueFilterSchema, filter);
      if (!valid.ok) return valid.result;
      const f = valid.data;
      const nowDate = now();
      const queue = [...records.values()]
        .map((r) => {
          const live = r.documents.filter((d) => d.status === "pending" || d.status === "verified").map((d) => d.expiresAt).sort();
          return {
            providerId: r.providerId,
            category: r.category,
            status: r.status,
            displayName: r.displayName ?? "",
            submittedAt: r.events.find((e) => e.toState === "submitted")?.occurredAt ?? "",
            earliestDocumentExpiry: live[0] ?? null,
          };
        })
        // Default queue = items needing action.
        .filter((q) => (f.status ? q.status === f.status : q.status === "submitted" || q.status === "under_review"))
        .filter((q) => !f.category || q.category === f.category)
        .filter((q) => !f.expiry || matchesExpiryWindow(q.earliestDocumentExpiry, f.expiry, nowDate))
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      return ok(queue);
    },

    async getProviderForReview(providerId) {
      const record = records.get(providerId);
      return record ? ok(structuredClone(record)) : fail("not_found");
    },

    async startReview(providerId, input) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const valid = validateInput(startReviewSchema, input);
      if (!valid.ok) return valid.result;
      const record = records.get(id.data);
      if (!record) return fail("not_found");
      if (record.version !== valid.data.expectedVersion) return fail("conflict");
      if (!canStartReview(record.status)) return fail("validation", { fields: { decision: "invalid_transition" } });
      const occurredAt = stamp();
      if (occurredAt === null) return fail("unavailable");
      return transition(record, "under_review", "Application under review.", occurredAt);
    },

    async submitDecision(providerId, input) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const valid = validateInput(adminReviewSchema, input);
      if (!valid.ok) return valid.result;
      const record = records.get(id.data);
      if (!record) return fail("not_found");
      if (record.version !== valid.data.expectedVersion) return fail("conflict");
      if (!allowedDecisions(record.status).includes(valid.data.decision)) {
        return fail("validation", { fields: { decision: "invalid_transition" } });
      }
      const occurredAt = stamp();
      if (occurredAt === null) return fail("unavailable");
      if (valid.data.decision === "approve") {
        const nowMs = Date.parse(occurredAt);
        const ready = record.documents.some(
          (d) => d.kind === REQUIRED_KIND[record.category] && d.status === "pending" && Date.parse(d.expiresAt) > nowMs,
        );
        if (!ready) return fail("validation", { fields: { documents: "credentials_required" } });
        for (const d of record.documents) if (d.status === "pending") d.status = "verified";
      }
      return transition(record, DECISION_RESULT[valid.data.decision], "Fixture review decision.", occurredAt);
    },

    async requestDocumentUrl() {
      // No synthetic URLs: private document viewing stays gated until a reviewed signer exists.
      return fail("gated");
    },

    async listCoverage(filter = {}) {
      const valid = validateInput(coverageFilterSchema, filter);
      if (!valid.ok) return valid.result;
      const f = valid.data;
      const rows = [...store.coverage.values()]
        .filter((a) => !f.category || a.category === f.category)
        .filter((a) => !f.state || a.state === f.state)
        .filter((a) => !f.pin || a.pinCode === f.pin)
        .sort((a, b) => a.pinCode.localeCompare(b.pinCode))
        .map((a) => structuredClone(a));
      return ok(rows);
    },

    async decideCoverage(input) {
      const valid = validateInput(coverageDecisionSchema, input);
      if (!valid.ok) return valid.result;
      const area = store.coverage.get(valid.data.areaId);
      if (!area) return fail("not_found");
      if (area.version !== valid.data.expectedVersion) return fail("conflict");
      if (!allowedCoverageDecisions(area.state).includes(valid.data.decision)) {
        return fail("validation", { fields: { decision: "invalid_transition" } });
      }
      area.state = COVERAGE_RESULT[valid.data.decision];
      area.version += 1;
      return ok(structuredClone(area));
    },
  };
}
