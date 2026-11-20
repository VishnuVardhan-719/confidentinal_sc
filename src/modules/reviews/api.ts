import type { ApiResult } from "@/lib/api/result";
import type { ModerationFilter, ModerationItem, ModerationLogEntry, ModerationPage, ModerationPageRequest, Review, ReviewableVisit } from "./types";

/**
 * Post-visit reviews for the signed-in patient. The server decides eligibility (completed booking,
 * owned by the patient, no earlier review) and moderation; a new or edited review is `pending_moderation`.
 */
export type ReviewsApi = {
  /** The patient's bookings with review state, newest first. */
  listVisits: () => Promise<ApiResult<ReviewableVisit[]>>;
  getVisit: (bookingId: string) => Promise<ApiResult<ReviewableVisit>>;
  /** One review per booking: a second submit returns `conflict` (an idempotent retry returns the first). */
  submit: (bookingId: string, input: unknown, idempotencyKey: string) => Promise<ApiResult<Review>>;
  /** Edit sends the review back to moderation. Version-checked; withdrawn reviews return `conflict`. */
  edit: (bookingId: string, input: unknown, expectedVersion: number) => Promise<ApiResult<Review>>;
  /** Withdraw is final: the review is hidden and the booking cannot be reviewed again. */
  withdraw: (bookingId: string, expectedVersion: number) => Promise<ApiResult<Review>>;
};

/** Review moderation for admins holding `review:moderate`. Items carry no patient identity. */
export type ReviewModerationApi = {
  /**
   * One page of the queue. `limit` 1..50 (default 20); `cursor` is the previous page's `nextCursor`.
   * A malformed, foreign or stale cursor returns `validation`.
   */
  listQueue: (filter: ModerationFilter, page?: ModerationPageRequest) => Promise<ApiResult<ModerationPage<ModerationItem>>>;
  /** Publish or reject one pending review. Version-checked; a decided review returns `conflict`. */
  decide: (reviewId: string, decision: unknown, expectedVersion: number) => Promise<ApiResult<ModerationItem>>;
  /** Read-only decision log, newest first. There is no undo; a later edit by the patient starts a new review cycle. */
  listDecisions: (page?: ModerationPageRequest) => Promise<ApiResult<ModerationPage<ModerationLogEntry>>>;
};
