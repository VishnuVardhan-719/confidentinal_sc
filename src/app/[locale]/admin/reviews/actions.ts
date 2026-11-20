"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { authorizeOperationsSession } from "@/modules/admin/session";
import { getReviewModerationApi, type ModerationItem } from "@/modules/reviews";

/**
 * Publish or reject one pending review. Re-checks the admin principal and `review:moderate` on every
 * call; the adapter (and backend) re-validate the decision and the expected version. Nothing is logged.
 */
export async function decideReviewAction(reviewId: string, decision: unknown, expectedVersion: number): Promise<ApiResult<ModerationItem>> {
  const { admin } = await authorizeOperationsSession("admin");
  if (!admin) return fail("unauthenticated");
  if (!can(admin, "review:moderate")) return fail("forbidden");
  try {
    return await getReviewModerationApi(process.env, true).decide(reviewId, decision, expectedVersion);
  } catch {
    return fail("unavailable");
  }
}
