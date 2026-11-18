import type { CareSubstate, CareTaskCode, CredentialStatus, RatePeriod, ShiftAttendance } from "./types";

/**
 * Canonical caretaker label keys (namespace `caretaker`) and tones.
 * Unknown values map to neutral "unknown", never to started/verified/active.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "caretaker.status.unknown", tone: "neutral", known: false };

function describe<K extends string>(map: Readonly<Record<K, readonly [string, StatusTone]>>, raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(map, raw)) return UNKNOWN;
  const [labelKey, tone] = map[raw as K];
  return { labelKey, tone, known: true };
}

const CARE: Record<CareSubstate, readonly [string, StatusTone]> = {
  assigned: ["caretaker.status.care.assigned", "info"],
  started: ["caretaker.status.care.started", "info"],
  ended: ["caretaker.status.care.ended", "success"],
  care_interrupted: ["caretaker.status.care.interrupted", "danger"],
};

const SHIFT: Record<ShiftAttendance, readonly [string, StatusTone]> = {
  scheduled: ["caretaker.status.shift.scheduled", "info"],
  checked_in: ["caretaker.status.shift.checkedIn", "info"],
  checked_out: ["caretaker.status.shift.checkedOut", "success"],
  absent: ["caretaker.status.shift.absent", "danger"],
  replaced: ["caretaker.status.shift.replaced", "warning"],
};

const CREDENTIAL: Record<CredentialStatus, readonly [string, StatusTone]> = {
  pending: ["caretaker.status.credential.pending", "warning"],
  verified: ["caretaker.status.credential.verified", "success"],
  rejected: ["caretaker.status.credential.rejected", "danger"],
  expired: ["caretaker.status.credential.expired", "danger"],
};

const TASK: Record<CareTaskCode, readonly [string, StatusTone]> = {
  companionship: ["caretaker.task.companionship", "neutral"],
  mobility_assistance: ["caretaker.task.mobilityAssistance", "neutral"],
  meal_assistance: ["caretaker.task.mealAssistance", "neutral"],
  personal_hygiene_assistance: ["caretaker.task.personalHygieneAssistance", "neutral"],
  light_household_help: ["caretaker.task.lightHouseholdHelp", "neutral"],
  escort_to_appointment: ["caretaker.task.escortToAppointment", "neutral"],
};

const PERIOD: Record<RatePeriod, readonly [string, StatusTone]> = {
  hour: ["caretaker.rate.perHour", "neutral"],
  day: ["caretaker.rate.perDay", "neutral"],
  week: ["caretaker.rate.perWeek", "neutral"],
  month: ["caretaker.rate.perMonth", "neutral"],
};

export const describeCare = (raw: unknown): StatusDescriptor => describe(CARE, raw);
export const describeShift = (raw: unknown): StatusDescriptor => describe(SHIFT, raw);
export const describeCredential = (raw: unknown): StatusDescriptor => describe(CREDENTIAL, raw);
/** Unknown task codes render as "unknown" and must never be offered as an action. */
export const describeTask = (raw: unknown): StatusDescriptor => describe(TASK, raw);
export const describeRatePeriod = (raw: unknown): StatusDescriptor => describe(PERIOD, raw);
