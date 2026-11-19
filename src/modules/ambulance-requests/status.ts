import { bookingStatusPresentation, type StatusPresentation } from "@/modules/bookings/status";
import { paymentStatusPresentation } from "@/modules/payments/status";
import type { RequestStatus } from "@/modules/service-requests/core";

export const ambulanceRequestStatusPresentation = (status: RequestStatus): StatusPresentation => bookingStatusPresentation(status);
export const ambulancePaymentPresentation = (status: string): StatusPresentation => paymentStatusPresentation(status);
/** A transfer creates no clinical record. Shown as its own badge, never merged with booking or payment. */
export function ambulanceRecordPresentation(): StatusPresentation & { icon: "lock" } {
  return { labelKey: "services.ambulance.record.none", tone: "neutral", icon: "lock" };
}
