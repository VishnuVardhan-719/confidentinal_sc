/**
 * Caretaker / agency view models. Nonclinical care only. Names follow S01
 * (`care_plans`, single agreed interval). Recurring plans are gated.
 */

export type IsoUtc = string;
export type Page<T> = { items: T[]; nextCursor: string | null };

export type BookingState =
  | "draft"
  | "requested"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled"
  | "no_show"
  | "interrupted";

export type CredentialStatus = "pending" | "verified" | "rejected" | "expired";

/** S01-Q13 permitted nonclinical task codes. Nothing clinical is representable. */
export type CareTaskCode =
  | "companionship"
  | "mobility_assistance"
  | "meal_assistance"
  | "personal_hygiene_assistance"
  | "light_household_help"
  | "escort_to_appointment";

export type RatePeriod = "hour" | "day" | "week" | "month";

export type CareRate = {
  period: RatePeriod;
  amountPaise: number;
  /** False when the backend price unit does not support this period yet (C01 has hour/day only). */
  periodSupportedByBackend: boolean;
};

export type CareService = {
  id: string;
  providerId: string;
  title: string;
  taskCodes: CareTaskCode[];
  rates: CareRate[];
  coveragePins: string[];
  active: boolean;
  version: number;
};

export type CaregiverProfile = {
  resourceId: string;
  profileId: string;
  displayName: string;
  agencyId: string | null;
  skills: CareTaskCode[];
  languages: string[];
  credentialStatus: CredentialStatus;
  membershipStatus: "invited" | "active" | "disabled";
};

export type CareRequest = {
  id: string;
  reference: string;
  providerId: string;
  bookingState: BookingState;
  taskCodes: CareTaskCode[];
  requestedInterval: { start: IsoUtc; end: IsoUtc };
  rateSnapshot: { period: RatePeriod; amountPaise: number; units: number; totalPaise: number; policyVersion: string };
  servicePin: string;
  version: number;
};

export type CareSubstate = "assigned" | "started" | "ended" | "care_interrupted";

export type CareInterruptReason =
  | "patient_unavailable"
  | "caregiver_unavailable"
  | "unsafe_conditions"
  | "scope_mismatch"
  | "medical_concern_escalated";

export type CareAssignment = {
  id: string;
  requestId: string;
  reference: string;
  providerId: string;
  agencyId: string | null;
  caregiver: { resourceId: string; displayName: string };
  substate: CareSubstate;
  taskCodes: CareTaskCode[];
  interval: { start: IsoUtc; end: IsoUtc };
  interruption: { reason: CareInterruptReason; recordedAt: IsoUtc } | null;
  version: number;
};

export type ShiftAttendance = "scheduled" | "checked_in" | "checked_out" | "absent" | "replaced";
export type AbsenceReason = "caregiver_unwell" | "caregiver_emergency" | "transport_issue" | "other";

export type CareShift = {
  id: string;
  assignmentId: string;
  caregiver: { resourceId: string; displayName: string };
  plannedStart: IsoUtc;
  plannedEnd: IsoUtc;
  /** Server timestamps only; the client never supplies check-in/out times. */
  checkInAt: IsoUtc | null;
  checkOutAt: IsoUtc | null;
  attendance: ShiftAttendance;
  absence: { reason: AbsenceReason; recordedAt: IsoUtc } | null;
  replacement: { resourceId: string; displayName: string; assignedAt: IsoUtc } | null;
  version: number;
};

/** Gated: recurring days/times, shift series, renewal. Typed so the gated screen can describe it. */
export type RecurringCarePlanDraft = {
  weekdays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
  startTime: string;
  endTime: string;
  taskCodes: CareTaskCode[];
  untilDate: string;
};

export type CareActor = {
  profileId: string;
  providerId: string;
  kind: "independent" | "agency_manager" | "agency_caregiver";
  agencyId: string | null;
  resourceId: string | null;
  membershipStatus: "invited" | "active" | "disabled";
};

export type CareActionInput = {
  assignmentId: string;
  action: "start" | "end" | "interrupt";
  expectedVersion: number;
  idempotencyKey: string;
  reason?: CareInterruptReason;
};

export type CareDeclineReason = "patient_request" | "provider_unavailable" | "unable_to_service" | "other";

export type CareRequestDecision =
  | { requestId: string; decision: "accept"; caregiverResourceId: string; expectedVersion: number; idempotencyKey: string }
  | { requestId: string; decision: "decline"; reason: CareDeclineReason; expectedVersion: number; idempotencyKey: string };

export type ShiftActionInput = { shiftId: string; expectedVersion: number; idempotencyKey: string };
