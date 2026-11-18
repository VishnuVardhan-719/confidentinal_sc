import { describeStatus, type StatusDescriptor } from "@/modules/clinical/status-core";
import type { BookingState, ChallengeStatus, VisitPhase } from "./types";
import type { ChallengePhase } from "./otp";

/** Booking status badge (doctor view). Separate from clinical and payment badges. */
export const BOOKING_STATE_MAP: Readonly<Record<BookingState, StatusDescriptor>> = {
  draft: { labelKey: "doctor.booking.status.draft", tone: "neutral" },
  requested: { labelKey: "doctor.booking.status.requested", tone: "info" },
  accepted: { labelKey: "doctor.booking.status.accepted", tone: "info" },
  confirmed: { labelKey: "doctor.booking.status.confirmed", tone: "success" },
  in_progress: { labelKey: "doctor.booking.status.inProgress", tone: "progress" },
  completed: { labelKey: "doctor.booking.status.completed", tone: "success" },
  declined: { labelKey: "doctor.booking.status.declined", tone: "neutral" },
  expired: { labelKey: "doctor.booking.status.expired", tone: "neutral" },
  cancelled: { labelKey: "doctor.booking.status.cancelled", tone: "neutral" },
  no_show: { labelKey: "doctor.booking.status.noShow", tone: "warning" },
  interrupted: { labelKey: "doctor.booking.status.interrupted", tone: "warning" },
};

export const VISIT_PHASE_MAP: Readonly<Record<VisitPhase, StatusDescriptor>> = {
  scheduled: { labelKey: "doctor.visit.phase.scheduled", tone: "neutral" },
  en_route: { labelKey: "doctor.visit.phase.enRoute", tone: "progress" },
  arrived: { labelKey: "doctor.visit.phase.arrived", tone: "info" },
  arrival_verified: { labelKey: "doctor.visit.phase.arrivalVerified", tone: "success" },
  service_started: { labelKey: "doctor.visit.phase.inConsultation", tone: "progress" },
  service_completed: { labelKey: "doctor.visit.phase.completed", tone: "success" },
};

export const CHALLENGE_STATUS_MAP: Readonly<Record<ChallengeStatus, StatusDescriptor>> = {
  active: { labelKey: "doctor.arrival.challenge.active", tone: "info" },
  verified: { labelKey: "doctor.arrival.challenge.verified", tone: "success" },
  expired: { labelKey: "doctor.arrival.challenge.expired", tone: "warning" },
  locked: { labelKey: "doctor.arrival.challenge.locked", tone: "danger" },
  superseded: { labelKey: "doctor.arrival.challenge.superseded", tone: "neutral" },
};

export const CHALLENGE_PHASE_MAP: Readonly<Record<ChallengePhase, StatusDescriptor>> = {
  enter_code: { labelKey: "doctor.arrival.phase.enterCode", tone: "info" },
  expired: { labelKey: "doctor.arrival.phase.expired", tone: "warning" },
  locked: { labelKey: "doctor.arrival.phase.locked", tone: "danger" },
  verified: { labelKey: "doctor.arrival.phase.verified", tone: "success" },
  superseded: { labelKey: "doctor.arrival.phase.superseded", tone: "neutral" },
};

export const describeBookingState = (s: string | null | undefined) => describeStatus(BOOKING_STATE_MAP, s);
export const describeVisitPhase = (s: string | null | undefined) => describeStatus(VISIT_PHASE_MAP, s);
export const describeChallengeStatus = (s: string | null | undefined) => describeStatus(CHALLENGE_STATUS_MAP, s);
export const describeChallengePhase = (s: string | null | undefined) => describeStatus(CHALLENGE_PHASE_MAP, s);
