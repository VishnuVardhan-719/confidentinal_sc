import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { FIXTURE_REVIEW_DETAILS } from "@/fixtures/identity";
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
import type { ProviderStatus } from "./status";

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

export function createFixtureVerificationApi(options: FixtureOptions = {}): VerificationApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  const records = new Map<string, ProviderReviewDetail>(
    FIXTURE_REVIEW_DETAILS.map((d) => [d.providerId, structuredClone(d)]),
  );

  function transition(record: ProviderReviewDetail, to: ProviderStatus, reason: string) {
    const from = record.status;
    record.status = to;
    record.version += 1;
    record.events.unshift({ fromState: from, toState: to, publicReason: reason, providerVersion: record.version, occurredAt: now().toISOString() });
    return ok({ providerId: record.providerId, status: record.status, version: record.version });
  }

  return {
    async listReviewQueue() {
      const queue = [...records.values()]
        .filter((r) => r.status === "submitted" || r.status === "under_review")
        .map((r) => ({
          providerId: r.providerId,
          category: r.category,
          status: r.status,
          displayName: r.displayName ?? "",
          submittedAt: r.events.find((e) => e.toState === "submitted")?.occurredAt ?? "",
        }));
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
      return transition(record, "under_review", "Application under review.");
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
      if (valid.data.decision === "approve") {
        const nowMs = now().getTime();
        const ready = record.documents.some(
          (d) => d.kind === REQUIRED_KIND[record.category] && d.status === "pending" && Date.parse(d.expiresAt) > nowMs,
        );
        if (!ready) return fail("validation", { fields: { documents: "credentials_required" } });
        for (const d of record.documents) if (d.status === "pending") d.status = "verified";
      }
      return transition(record, DECISION_RESULT[valid.data.decision], "Fixture review decision.");
    },

    async requestDocumentUrl() {
      // No synthetic URLs: private document viewing stays gated until a reviewed signer exists.
      return fail("gated");
    },
  };
}
