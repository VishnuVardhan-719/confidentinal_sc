import type { Category } from "@/modules/catalog/schemas";

/** Moderation lifecycle. A new review is never public until moderation publishes it. */
export const REVIEW_STATUSES = ["pending_moderation", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

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
