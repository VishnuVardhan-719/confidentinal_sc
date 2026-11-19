"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getReviewsApi, type Review, type ReviewsApi } from "@/modules/reviews";

/** Review mutations. Each re-resolves the session; the adapter (and backend) re-check eligibility, ownership, versions. Nothing is logged. */
async function run(fn: (api: ReviewsApi) => Promise<ApiResult<Review>>): Promise<ApiResult<Review>> {
  const session = getPatientSession();
  if (session.status !== "ok") return fail("unauthenticated");
  try {
    return await fn(getReviewsApi(process.env, session.fixtureActor));
  } catch {
    return fail("unavailable");
  }
}

export async function submitReviewAction(bookingId: string, input: unknown, idempotencyKey: string): Promise<ApiResult<Review>> {
  return run((api) => api.submit(bookingId, input, idempotencyKey));
}

export async function editReviewAction(bookingId: string, input: unknown, expectedVersion: number): Promise<ApiResult<Review>> {
  return run((api) => api.edit(bookingId, input, expectedVersion));
}

export async function withdrawReviewAction(bookingId: string, expectedVersion: number): Promise<ApiResult<Review>> {
  return run((api) => api.withdraw(bookingId, expectedVersion));
}
