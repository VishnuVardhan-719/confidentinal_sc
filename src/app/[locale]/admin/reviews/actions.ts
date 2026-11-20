"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { getOperationsSession } from "@/modules/admin/session";
import { getReviewModerationApi, moderationDecisionSchema, reviewIdSchema, versionSchema, type ModerationItem } from "@/modules/reviews";

/**
 * Publish or reject one pending review. The action validates its own untrusted arguments first
 * (review id is a uuid, expected version a positive integer, decision a known shape), so bad input
 * never reaches the session lookup or the adapter. Then it re-checks the admin principal and
 * `review:moderate` on every call; the adapter (and backend) validate again. Nothing is logged.
 */
export async function decideReviewAction(reviewId: string, decision: unknown, expectedVersion: number): Promise<ApiResult<ModerationItem>> {
  const id = reviewIdSchema.safeParse(reviewId);
  const version = versionSchema.safeParse(expectedVersion);
  const choice = moderationDecisionSchema.safeParse(decision);
  if (!id.success || !version.success || !choice.success) return fail("validation");
  const { admin } = await getOperationsSession();
  if (!admin) return fail("unauthenticated");
  if (!can(admin, "review:moderate")) return fail("forbidden");
  try {
    return await getReviewModerationApi(process.env, true, admin.profileId).decide(id.data.toLowerCase(), choice.data, version.data);
  } catch {
    return fail("unavailable");
  }
}
