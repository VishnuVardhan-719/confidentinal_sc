import type { Category } from "@/modules/catalog/schemas";
import type { BookingReview } from "@/modules/bookings/wizard";
import type { Booking } from "@/modules/bookings/schemas";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
export const testId = "00000000-0000-4000-8000-000000000001";
export function reviewedFixture(category: Category = "doctor"): BookingReview {
  const provider = syntheticProvider(category);
  const details: BookingReview["details"] = category === "doctor" ? { category, visitReason: "Synthetic visit" }
    : category === "lab" ? { category, testServiceIds: [provider.serviceId], collection: "home" }
    : category === "ambulance" ? { category, mode: "scheduled", destinationAddressId: testId, passengers: 1 }
    : { category, scope: "nonclinical", tasks: ["companionship"], units: 1, unit: "hour" };
  return { service: { providerId: provider.id, serviceId: provider.serviceId, category },
    patient: { patientId: testId, questionnaireComplete: true, access: "self" }, location: { addressId: testId, pin: "500001" },
    schedule: { startAt: "2026-11-20T04:30:00.000Z", endAt: "2026-11-20T05:30:00.000Z" }, details,
    paymentPolicy: { method: "pay_after", priceSnapshot: { amountPaise: provider.amountPaise, currency: "INR", termsVersion: "synthetic-not-approved", policyVersionId: testId },
      approvedPolicyVersionId: testId, accepted: true, noticeVersion: "synthetic-not-approved" }, confirmed: true, eligibilityVersion: 1 };
}
export function bookingFromReview(review: BookingReview): Booking {
  return { id: testId, publicReference: null, providerId: review.service.providerId, serviceId: review.service.serviceId,
    category: review.service.category, pin: review.location.pin, startAt: review.schedule.startAt, endAt: review.schedule.endAt,
    status: "REQUESTED", version: 2, priceSnapshot: structuredClone(review.paymentPolicy.priceSnapshot), doctorOperationalStatus: null, synthetic: true };
}
