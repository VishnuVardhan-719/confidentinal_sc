import type { Booking } from "./schemas";
import type { BookingReview } from "./wizard";

export function bookingMatchesReview(booking: Booking, review: BookingReview): boolean {
  return booking.providerId === review.service.providerId && booking.serviceId === review.service.serviceId && booking.category === review.service.category
    && booking.pin === review.location.pin && booking.startAt === review.schedule.startAt && booking.endAt === review.schedule.endAt
    && booking.priceSnapshot.amountPaise === review.paymentPolicy.priceSnapshot.amountPaise
    && booking.priceSnapshot.currency === review.paymentPolicy.priceSnapshot.currency
    && booking.priceSnapshot.termsVersion === review.paymentPolicy.priceSnapshot.termsVersion
    && booking.priceSnapshot.policyVersionId === review.paymentPolicy.approvedPolicyVersionId;
}
