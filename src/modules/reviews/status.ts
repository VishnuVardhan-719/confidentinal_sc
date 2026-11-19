import type { StatusPresentation } from "@/components/shared/status";
import type { ReviewableVisit, ReviewStatus } from "./types";

/** Badge for a review's moderation state. Text label always; colour is never the only signal. */
export function describeReviewStatus(status: ReviewStatus): StatusPresentation {
  switch (status) {
    case "pending_moderation":
      return { tone: "info", labelKey: "patientAccount.reviews.status.pending_moderation", icon: "clock" };
    case "published":
      return { tone: "success", labelKey: "patientAccount.reviews.status.published" };
    case "rejected":
      return { tone: "neutral", labelKey: "patientAccount.reviews.status.rejected", icon: "x" };
  }
}

export type ReviewEligibility = "can_review" | "already_reviewed" | "not_completed";

/** One review per booking, and only after the server reports the booking completed. */
export function reviewEligibility(visit: Pick<ReviewableVisit, "bookingState" | "review">): ReviewEligibility {
  if (visit.review) return "already_reviewed";
  return visit.bookingState === "completed" ? "can_review" : "not_completed";
}
