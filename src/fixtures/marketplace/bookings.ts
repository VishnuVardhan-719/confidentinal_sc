import type { Booking } from "@/modules/bookings/schemas";
export function syntheticBooking(id: string): Booking {
  return { id, publicReference: null, providerId: "00000000-0000-4000-8000-000000000001", serviceId: "00000000-0000-4000-8001-000000000001",
    category: "doctor", pin: "500001", startAt: "2026-11-20T04:30:00.000Z", endAt: "2026-11-20T05:30:00.000Z", status: "REQUESTED", version: 2,
    priceSnapshot: { amountPaise: 50000, currency: "INR", termsVersion: "synthetic-not-approved", policyVersionId: "00000000-0000-4000-8000-000000000051" },
    doctorOperationalStatus: null, synthetic: true };
}
