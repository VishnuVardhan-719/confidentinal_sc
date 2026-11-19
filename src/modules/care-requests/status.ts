import { bookingStatusPresentation, type StatusPresentation } from "@/modules/bookings/status";
import { paymentStatusPresentation } from "@/modules/payments/status";
import type { RequestStatus } from "@/modules/service-requests/core";

export const careRequestStatusPresentation = (status: RequestStatus): StatusPresentation => bookingStatusPresentation(status);
export const carePaymentPresentation = (status: string): StatusPresentation => paymentStatusPresentation(status);
/** Caretakers give non-clinical help, so a care request never has a medical record. Shown as its own badge. */
export function careRecordPresentation(): StatusPresentation & { icon: "lock" } {
  return { labelKey: "services.care.record.nonClinical", tone: "neutral", icon: "lock" };
}
