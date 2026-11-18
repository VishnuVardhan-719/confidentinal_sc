import type { PaymentStatus, PaymentSummary } from "@/modules/payments/schemas";
export function syntheticPayment(bookingId: string, status: PaymentStatus = "DUE"): PaymentSummary {
  return { bookingId, status, currency: "INR", amountDuePaise: status === "PAID" || status === "REFUNDED" ? 0 : status === "PARTIALLY_PAID" ? 25000 : 50000,
    collectedPaise: status === "PAID" || status === "REFUNDED" ? 50000 : status === "PARTIALLY_PAID" ? 25000 : 0,
    refundedPaise: status === "REFUNDED" ? 50000 : 0, method: "pay_after", version: 1, synthetic: true };
}
