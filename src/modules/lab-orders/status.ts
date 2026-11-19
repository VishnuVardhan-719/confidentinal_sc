import { bookingStatusPresentation, type StatusPresentation } from "@/modules/bookings/status";
import { paymentStatusPresentation } from "@/modules/payments/status";
import type { RequestStatus } from "@/modules/service-requests/core";

/** Booking state badge (shared booking labels). */
export const labOrderStatusPresentation = (status: RequestStatus): StatusPresentation => bookingStatusPresentation(status);
/** Payment badge, separate from the booking state. */
export const labPaymentPresentation = (status: string): StatusPresentation => paymentStatusPresentation(status);
/**
 * Report badge, separate from booking and payment. Reports are released only by an authorised reviewer and
 * then appear in the patient's Records; this flow never shows or releases one.
 */
export function labReportPresentation(status: RequestStatus): StatusPresentation & { icon: "lock" } {
  return status === "COMPLETED"
    ? { labelKey: "services.lab.report.awaitingReview", tone: "neutral", icon: "lock" }
    : { labelKey: "services.lab.report.none", tone: "neutral", icon: "lock" };
}
