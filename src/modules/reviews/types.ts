import type { Category } from "@/modules/catalog/schemas";

/**
 * Moderation lifecycle. A new or edited review is never public until moderation publishes it.
 * `withdrawn` is set by the patient and is final (the booking cannot be reviewed again).
 */
export const REVIEW_STATUSES = ["pending_moderation", "published", "rejected", "withdrawn"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Reasons a moderator may give when rejecting; shown to the patient as fixed copy (no free text). */
export const REJECTION_REASONS = ["personal_info", "not_about_service", "offensive", "spam"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REVIEW_TEXT_MIN = 10;
export const REVIEW_TEXT_MAX = 1000;
export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

export type Review = {
  id: string;
  bookingId: string;
  rating: Rating;
  text: string;
  status: ReviewStatus;
  submittedAt: string;
  /** Set when moderation rejects; null otherwise. */
  rejectionReason: RejectionReason | null;
  version: number;
};

/** A booking the patient may review. Only `completed` bookings are reviewable; at most one review each. */
export type ReviewableVisit = {
  bookingId: string;
  bookingReference: string;
  category: Category;
  providerDisplayName: string;
  /** Booking state from the server; the UI never infers completion. */
  bookingState: "completed" | "other";
  completedAt: string | null;
  review: Review | null;
};

export type ReviewInput = { rating: Rating; text: string };

export const REVIEW_ISSUES = ["rating_required", "text_too_short", "text_too_long", "text_contact"] as const;
export type ReviewIssue = (typeof REVIEW_ISSUES)[number];
export type ReviewField = keyof ReviewInput;

/** What a moderator sees: no patient identity, only the booking reference, provider and the review itself. */
export type ModerationItem = {
  reviewId: string;
  bookingReference: string;
  category: Category;
  providerDisplayName: string;
  rating: Rating;
  text: string;
  status: ReviewStatus;
  submittedAt: string;
  rejectionReason: RejectionReason | null;
  version: number;
};

export const MODERATION_FILTERS = ["pending_moderation", "published", "rejected"] as const;
export type ModerationFilter = (typeof MODERATION_FILTERS)[number];

export type ModerationDecision = { decision: "publish" } | { decision: "reject"; reason: RejectionReason };

/** Page size for the moderation queue and the decision log (the server caps `limit` at 50). */
export const MODERATION_PAGE_SIZE = 20;
export const MODERATION_PAGE_MAX = 50;
/** Opaque server cursor. The UI only passes it back; it must never encode a review or patient id. */
export type ModerationPageRequest = { limit?: number; cursor?: string };
export type ModerationPage<T> = { items: T[]; nextCursor: string | null };

/**
 * One recorded moderation decision (append-only; nothing in the UI can change or undo it). Carries
 * the booking reference and provider only: no patient identity, no review text, no moderator id.
 * `decidedBySelf` is computed by the server against the requesting moderator.
 */
export type ModerationLogEntry = {
  entryId: string;
  bookingReference: string;
  category: Category;
  providerDisplayName: string;
  outcome: "published" | "rejected";
  reason: RejectionReason | null;
  decidedAt: string;
  decidedBySelf: boolean;
};
