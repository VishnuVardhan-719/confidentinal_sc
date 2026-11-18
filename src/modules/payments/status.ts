import type { PaymentStatus } from "./schemas";
import type { StatusPresentation } from "@/modules/bookings/status";
export const PAYMENT_STATUS_PRESENTATION = {
  NOT_INITIATED: { labelKey: "payment.status.notInitiated", tone: "neutral" },
  DUE: { labelKey: "payment.status.due", tone: "warning" },
  PROCESSING: { labelKey: "payment.status.processing", tone: "info" },
  PAID: { labelKey: "payment.status.paid", tone: "success" },
  PARTIALLY_PAID: { labelKey: "payment.status.partiallyPaid", tone: "warning" },
  DISPUTED: { labelKey: "payment.status.disputed", tone: "warning" },
  REFUNDED: { labelKey: "payment.status.refunded", tone: "neutral" },
} satisfies Record<PaymentStatus, StatusPresentation>;
export function paymentStatusPresentation(status: string): StatusPresentation {
  return Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_PRESENTATION, status)
    ? PAYMENT_STATUS_PRESENTATION[status as keyof typeof PAYMENT_STATUS_PRESENTATION]
    : { labelKey: "payment.status.unknown", tone: "neutral" };
}
