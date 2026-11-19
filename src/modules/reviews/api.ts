import type { ApiResult } from "@/lib/api/result";
import type { Review, ReviewableVisit } from "./types";

/**
 * Post-visit reviews. The server decides eligibility (completed booking, owned by the patient, no
 * earlier review) and moderation; a new review always starts as `pending_moderation`.
 */
export type ReviewsApi = {
  /** The patient's bookings with review state, newest first. */
  listVisits: () => Promise<ApiResult<ReviewableVisit[]>>;
  getVisit: (bookingId: string) => Promise<ApiResult<ReviewableVisit>>;
  /** One review per booking: a second submit returns `conflict` (an idempotent retry returns the first). */
  submit: (bookingId: string, input: unknown, idempotencyKey: string) => Promise<ApiResult<Review>>;
};
