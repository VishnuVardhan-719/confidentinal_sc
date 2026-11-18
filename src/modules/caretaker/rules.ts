import { z } from "zod";
import type {
  CareActor,
  CareAssignment,
  CaregiverProfile,
  CareInterruptReason,
  CareShift,
  CareSubstate,
  CareTaskCode,
  ShiftAttendance,
} from "./types";

/** Permitted nonclinical task codes (S01-Q13 proposal). */
export const CARE_TASK_CODES = [
  "companionship",
  "mobility_assistance",
  "meal_assistance",
  "personal_hygiene_assistance",
  "light_household_help",
  "escort_to_appointment",
] as const satisfies readonly CareTaskCode[];

export const careTaskCodeSchema = z.enum(CARE_TASK_CODES);

export function isPermittedCareTask(value: unknown): value is CareTaskCode {
  return careTaskCodeSchema.safeParse(value).success;
}

/**
 * Patient care request body. Unknown or clinical task codes (medication,
 * injections, wound/catheter care, vitals, clinical notes) are rejected, and
 * strict objects reject any extra clinical field.
 */
export const careRequestSchema = z.strictObject({
  serviceId: z.string().min(1).max(64),
  taskCodes: z.array(careTaskCodeSchema).min(1).max(CARE_TASK_CODES.length)
    .refine((codes) => new Set(codes).size === codes.length),
  period: z.enum(["hour", "day"]),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
}).refine((v) => Date.parse(v.end) > Date.parse(v.start), { path: ["end"] });

/** Shift check-in/out bodies carry no time: the server stamps check-in and check-out. */
export const shiftActionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });

export const CARE_INTERRUPT_REASONS = [
  "patient_unavailable",
  "caregiver_unavailable",
  "unsafe_conditions",
  "scope_mismatch",
  "medical_concern_escalated",
] as const satisfies readonly CareInterruptReason[];

const CARE_TRANSITIONS: Record<"start" | "end" | "interrupt", { from: readonly CareSubstate[]; to: CareSubstate }> = {
  start: { from: ["assigned"], to: "started" },
  end: { from: ["started"], to: "ended" },
  interrupt: { from: ["assigned", "started"], to: "care_interrupted" },
};

export function nextCareSubstate(current: CareSubstate, action: "start" | "end" | "interrupt"): CareSubstate | null {
  const rule = CARE_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

/** Does the caregiver's verified skill set cover every requested task? */
export function caregiverCoversTasks(caregiver: CaregiverProfile, tasks: readonly CareTaskCode[]): boolean {
  return tasks.every((task) => caregiver.skills.includes(task));
}

export function caregiverAssignable(caregiver: CaregiverProfile, tasks: readonly CareTaskCode[]): boolean {
  return caregiver.membershipStatus === "active" && caregiver.credentialStatus === "verified" && caregiverCoversTasks(caregiver, tasks);
}

const isOwnAssignment = (actor: CareActor, a: CareAssignment) =>
  actor.resourceId !== null && a.caregiver.resourceId === actor.resourceId;

/**
 * Staff/agency scoping: independent caregivers and agency caregivers see only
 * their own assignments; an agency manager sees the agency's assignments.
 */
export function visibleAssignments(actor: CareActor, assignments: readonly CareAssignment[]): CareAssignment[] {
  if (actor.membershipStatus !== "active") return [];
  return assignments.filter((a) => {
    if (a.providerId !== actor.providerId) return false;
    if (actor.kind === "agency_manager") return actor.agencyId !== null && a.agencyId === actor.agencyId;
    return isOwnAssignment(actor, a);
  });
}

export type CareDenial = "membership_inactive" | "not_assigned" | "invalid_transition" | "reason_required" | "too_early";

/** Only the assigned caregiver records start/end; an agency manager may record an interruption. */
export function careActionDenial(
  actor: CareActor,
  assignment: CareAssignment,
  action: "start" | "end" | "interrupt",
  options: { reason?: CareInterruptReason; now?: Date } = {},
): CareDenial | null {
  if (actor.membershipStatus !== "active") return "membership_inactive";
  const scoped = visibleAssignments(actor, [assignment]).length === 1;
  const own = isOwnAssignment(actor, assignment);
  const allowed = action === "interrupt" ? scoped : own && scoped;
  if (!allowed) return "not_assigned";
  if (nextCareSubstate(assignment.substate, action) === null) return "invalid_transition";
  if (action === "interrupt" && (options.reason === undefined || !CARE_INTERRUPT_REASONS.includes(options.reason))) {
    return "reason_required";
  }
  if (action === "start" && (options.now ?? new Date()).getTime() < Date.parse(assignment.interval.start)) return "too_early";
  return null;
}

const SHIFT_TRANSITIONS: Record<"check_in" | "check_out" | "absent" | "replace", { from: readonly ShiftAttendance[]; to: ShiftAttendance }> = {
  check_in: { from: ["scheduled"], to: "checked_in" },
  check_out: { from: ["checked_in"], to: "checked_out" },
  absent: { from: ["scheduled"], to: "absent" },
  replace: { from: ["absent"], to: "replaced" },
};

export function nextShiftAttendance(current: ShiftAttendance, action: keyof typeof SHIFT_TRANSITIONS): ShiftAttendance | null {
  const rule = SHIFT_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

/** A replacement must be a different, assignable caregiver of the same agency covering the tasks. */
export function replacementAllowed(
  shift: CareShift,
  replacement: CaregiverProfile,
  agencyId: string | null,
  tasks: readonly CareTaskCode[],
): boolean {
  return (
    shift.attendance === "absent" &&
    replacement.resourceId !== shift.caregiver.resourceId &&
    agencyId !== null &&
    replacement.agencyId === agencyId &&
    caregiverAssignable(replacement, tasks)
  );
}

/** Integer paise total for a rate snapshot. Returns null if inputs are not safe integers. */
export function rateTotalPaise(amountPaise: number, units: number): number | null {
  if (!Number.isSafeInteger(amountPaise) || !Number.isSafeInteger(units) || amountPaise < 0 || units <= 0) return null;
  const total = amountPaise * units;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * Advanced recurring plans (shift series, renewal) are gated until a scheduler
 * and policy are approved (CR-02; `care_shifts` deferred). There is no flag in
 * src/lib/feature-flags for this yet (requested in REQUESTS.md), so the gate is
 * a hard OFF here and cannot be switched on from the client.
 */
export const RECURRING_CARE_GATE = { enabled: false, reason: "scheduler_and_policy_not_approved" } as const;

export function isRecurringCareEnabled(): false {
  return RECURRING_CARE_GATE.enabled;
}
