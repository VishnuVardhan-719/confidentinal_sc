import type { BookingStatus, DoctorStatus } from "./schemas";
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusPresentation = { labelKey: string; tone: StatusTone };
export const BOOKING_STATUS_PRESENTATION = {
  DRAFT: { labelKey: "booking.status.draft", tone: "neutral" },
  REQUESTED: { labelKey: "booking.status.requested", tone: "info" },
  ACCEPTED: { labelKey: "booking.status.accepted", tone: "info" },
  CONFIRMED: { labelKey: "booking.status.confirmed", tone: "success" },
  IN_PROGRESS: { labelKey: "booking.status.inProgress", tone: "info" },
  COMPLETED: { labelKey: "booking.status.completed", tone: "success" },
  DECLINED: { labelKey: "booking.status.declined", tone: "warning" },
  EXPIRED: { labelKey: "booking.status.expired", tone: "neutral" },
  CANCELLED: { labelKey: "booking.status.cancelled", tone: "neutral" },
  INTERRUPTED: { labelKey: "booking.status.interrupted", tone: "warning" },
  NO_SHOW: { labelKey: "booking.status.noShow", tone: "warning" },
  EN_ROUTE: { labelKey: "booking.status.enRoute", tone: "info" },
  ARRIVED: { labelKey: "booking.status.arrived", tone: "info" },
  ARRIVAL_VERIFIED: { labelKey: "booking.status.arrivalVerified", tone: "success" },
  IN_CONSULTATION: { labelKey: "booking.status.inConsultation", tone: "info" },
} satisfies Record<BookingStatus | DoctorStatus, StatusPresentation>;
export function bookingStatusPresentation(status: string): StatusPresentation {
  return Object.prototype.hasOwnProperty.call(BOOKING_STATUS_PRESENTATION, status)
    ? BOOKING_STATUS_PRESENTATION[status as keyof typeof BOOKING_STATUS_PRESENTATION]
    : { labelKey: "booking.status.unknown", tone: "neutral" };
}
