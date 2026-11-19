"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getReviewsApi, type Review } from "@/modules/reviews";

/** Submit one review. The adapter (and backend) re-check eligibility, ownership and input. Nothing is logged. */
export async function submitReviewAction(bookingId: string, input: unknown, idempotencyKey: string): Promise<ApiResult<Review>> {
  const session = await getPatientSession();
  if (session.status !== "ok") return fail("unauthenticated");
  try {
    return await getReviewsApi(process.env, session.fixtureActor).submit(bookingId, input, idempotencyKey);
  } catch {
    return fail("unavailable");
  }
}
