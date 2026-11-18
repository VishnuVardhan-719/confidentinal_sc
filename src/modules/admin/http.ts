import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import type { AdminApi } from "./api";
import { createHttpClient, seg, type HttpOptions } from "./http-util";
import { gateSettings, providerReviewBodySchema } from "./rules";

/**
 * HTTP adapter for admin.
 *
 * Documented in docs/API_CONTRACTS.md and wired here:
 *   POST /api/admin/providers/:id/review   body { decision, reason, expectedVersion }
 *   (response shape taken from origin/task/C01-catalog: { provider: providers row })
 *
 * Not documented, therefore `gated` (see REQUESTS.md): provider review queue
 * and detail, coverage queue/review/history (C01 has /api/catalog/admin/coverage
 * but it is not in API_CONTRACTS), booking ops search, admin invites/scope/
 * suspend, payments, refunds and support queue.
 *
 * getSettings reads the server-side flag registry; it is display-only.
 */
const gated = async (): Promise<ApiResult<never>> => fail("gated");

const reviewResponse = z
  .object({
    provider: z.object({ id: z.string().min(1), verification_state: z.string(), version: z.number().int().positive() }),
  })
  .transform(({ provider }) => ({
    providerId: provider.id,
    verificationState: provider.verification_state,
    version: provider.version,
  }));

export type AdminHttpOptions = HttpOptions & { env?: Record<string, string | undefined> };

export function createAdminHttpApi(options: AdminHttpOptions = {}): AdminApi {
  const request = createHttpClient(options);
  const env = options.env ?? process.env;

  return {
    mode: "http",

    listProviderReviews: gated,
    getProviderReview: gated,

    async decideProviderReview(input) {
      const body = providerReviewBodySchema.safeParse({
        decision: input.decision,
        reason: input.reason,
        expectedVersion: input.expectedVersion,
      });
      if (!body.success) return fail("validation", { fields: { reason: "invalid" } });
      return request({
        method: "POST",
        path: `/api/admin/providers/${seg(input.providerId)}/review`,
        body: body.data,
        idempotencyKey: input.idempotencyKey,
        schema: reviewResponse,
      });
    },

    listCoverage: gated,
    decideCoverage: gated,
    listCoverageHistory: gated,
    findBookingByReference: gated,
    listBookingExceptions: gated,
    listAdmins: gated,
    listAdminInvites: gated,
    inviteAdmin: gated,
    setAdminScope: gated,
    suspendAdmin: gated,
    listPayments: gated,
    listRefunds: gated,
    listSupportQueue: gated,

    async getSettings() {
      return ok(gateSettings(env));
    },
  };
}
