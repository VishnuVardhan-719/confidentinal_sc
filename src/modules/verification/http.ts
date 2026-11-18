import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { createJsonClient, toApiResult, validateInput, type HttpAdapterOptions } from "@/modules/auth/http-client";
import type { VerificationApi } from "./api";
import { providerReadSchema, providerRowEnvelopeSchema, reviewDetailFromRead, rowStatus } from "./dto";
import { adminReviewSchema, startReviewSchema, type ReviewDecision, type ReviewResult } from "./schemas";

/**
 * HTTP adapter. Endpoints from I02: `GET /api/providers/:id`,
 * `POST /api/admin/providers/:id/review` (also listed in API_CONTRACTS.md),
 * `POST /api/providers/:id/documents/:documentId/signed-url`.
 * Gated (no contract): review queue list, `changes_required` decision, coverage list/decisions.
 */

const DECISION_TO_SERVER: Readonly<Record<Exclude<ReviewDecision, "changes_required">, string>> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
};

const uuid = z.uuid();
const signedUrlSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime({ offset: true }) });

export function createHttpVerificationApi(options: HttpAdapterOptions = {}): VerificationApi {
  const client = createJsonClient(options);

  async function review(providerId: string, decision: string, reason: string, expectedVersion: number): Promise<ApiResult<ReviewResult>> {
    const result = await client.request({
      method: "POST",
      path: `/api/admin/providers/${providerId}/review`,
      body: { decision, reason, expectedVersion },
      schema: providerRowEnvelopeSchema,
    });
    if (!result.ok) return toApiResult(result);
    const row = result.data.provider;
    return ok({ providerId: row.id, status: rowStatus(row), version: row.version });
  }

  return {
    async listReviewQueue() {
      return fail("gated");
    },

    async getProviderForReview(providerId) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const result = await client.request({ method: "GET", path: `/api/providers/${id.data}`, schema: providerReadSchema });
      return result.ok ? ok(reviewDetailFromRead(result.data.provider)) : toApiResult(result);
    },

    async startReview(providerId, input) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const valid = validateInput(startReviewSchema, input);
      if (!valid.ok) return valid.result;
      return review(id.data, "under_review", valid.data.reason, valid.data.expectedVersion);
    },

    async submitDecision(providerId, input) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const valid = validateInput(adminReviewSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.decision === "changes_required") return fail("gated");
      return review(id.data, DECISION_TO_SERVER[valid.data.decision], valid.data.reason, valid.data.expectedVersion);
    },

    async requestDocumentUrl(providerId, documentId) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const doc = validateInput(uuid, documentId);
      if (!doc.ok) return doc.result;
      const result = await client.request({
        method: "POST",
        path: `/api/providers/${id.data}/documents/${doc.data}/signed-url`,
        schema: signedUrlSchema,
      });
      if (!result.ok && result.serverCode === "provider_signed_urls_unavailable") return fail("gated");
      return toApiResult(result);
    },

    async listCoverage() {
      return fail("gated");
    },

    async decideCoverage() {
      return fail("gated");
    },
  };
}
