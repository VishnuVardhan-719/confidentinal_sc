import type { Metric } from "@/modules/admin/access";
import { careActionDenial, nextShiftAttendance, RECURRING_CARE_GATE } from "./rules";
import { describeCare, describeCredential, describeRatePeriod, describeShift, describeTask, type StatusDescriptor } from "./status";
import type { CareActor, CareAssignment, CaregiverProfile, CareRequest, CareService, CareShift, CareTaskCode } from "./types";

export type CaretakerDashboardVM = {
  kind: CareActor["kind"];
  pendingRequests: Metric | null;
  todayAssignments: Metric;
  activeCare: Metric;
};

export type RateVM = { period: StatusDescriptor; amountPaise: number; periodSupportedByBackend: boolean };

export type ServiceRowVM = {
  id: string;
  title: string;
  tasks: StatusDescriptor[];
  rates: RateVM[];
  coveragePins: string[];
  active: boolean;
  version: number;
};

export const toServiceRow = (s: CareService): ServiceRowVM => ({
  id: s.id,
  title: s.title,
  tasks: s.taskCodes.map(describeTask),
  rates: s.rates.map((r) => ({ period: describeRatePeriod(r.period), amountPaise: r.amountPaise, periodSupportedByBackend: r.periodSupportedByBackend })),
  coveragePins: s.coveragePins,
  active: s.active === true,
  version: s.version,
});

export type CaregiverRowVM = {
  resourceId: string;
  displayName: string;
  skills: StatusDescriptor[];
  languages: string[];
  credential: StatusDescriptor;
  membershipKey: string;
};

export const toCaregiverRow = (c: CaregiverProfile): CaregiverRowVM => ({
  resourceId: c.resourceId,
  displayName: c.displayName,
  skills: c.skills.map(describeTask),
  languages: c.languages,
  credential: describeCredential(c.credentialStatus),
  membershipKey: `caretaker.membership.${c.membershipStatus}`,
});

export type CareRequestRowVM = {
  id: string;
  reference: string;
  taskCodes: CareTaskCode[];
  tasks: StatusDescriptor[];
  start: string;
  end: string;
  rate: { period: StatusDescriptor; amountPaise: number; units: number; totalPaise: number; policyVersion: string };
  servicePin: string;
  canDecide: boolean;
  version: number;
};

export const toCareRequestRow = (r: CareRequest): CareRequestRowVM => ({
  id: r.id,
  reference: r.reference,
  taskCodes: r.taskCodes,
  tasks: r.taskCodes.map(describeTask),
  start: r.requestedInterval.start,
  end: r.requestedInterval.end,
  rate: { ...r.rateSnapshot, period: describeRatePeriod(r.rateSnapshot.period) },
  servicePin: r.servicePin,
  canDecide: r.bookingState === "requested",
  version: r.version,
});

export type AssignmentRowVM = {
  id: string;
  reference: string;
  caregiverName: string;
  status: StatusDescriptor;
  tasks: StatusDescriptor[];
  start: string;
  end: string;
  interruptionKey: string | null;
  actions: ("start" | "end" | "interrupt")[];
  version: number;
};

export function toAssignmentRow(a: CareAssignment, actor: CareActor, now: Date): AssignmentRowVM {
  const actions = (["start", "end", "interrupt"] as const).filter(
    (action) => careActionDenial(actor, a, action, { reason: "caregiver_unavailable", now }) === null,
  );
  return {
    id: a.id,
    reference: a.reference,
    caregiverName: a.caregiver.displayName,
    status: describeCare(a.substate),
    tasks: a.taskCodes.map(describeTask),
    start: a.interval.start,
    end: a.interval.end,
    interruptionKey: a.interruption ? `caretaker.interrupt.${a.interruption.reason}` : null,
    actions: [...actions],
    version: a.version,
  };
}

export type ShiftRowVM = {
  id: string;
  caregiverName: string;
  plannedStart: string;
  plannedEnd: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  attendance: StatusDescriptor;
  absenceKey: string | null;
  replacementName: string | null;
  actions: ("check_in" | "check_out" | "absent" | "replace")[];
  version: number;
};

export function toShiftRow(s: CareShift, actor: CareActor): ShiftRowVM {
  const own = actor.resourceId !== null && s.caregiver.resourceId === actor.resourceId;
  const manager = actor.kind === "agency_manager";
  const actions = (["check_in", "check_out", "absent", "replace"] as const).filter((a) => {
    if (nextShiftAttendance(s.attendance, a) === null) return false;
    if (a === "replace") return manager;
    if (a === "absent") return own || manager;
    return own;
  });
  return {
    id: s.id,
    caregiverName: s.caregiver.displayName,
    plannedStart: s.plannedStart,
    plannedEnd: s.plannedEnd,
    checkInAt: s.checkInAt,
    checkOutAt: s.checkOutAt,
    attendance: describeShift(s.attendance),
    absenceKey: s.absence ? `caretaker.absence.${s.absence.reason}` : null,
    replacementName: s.replacement?.displayName ?? null,
    actions: [...actions],
    version: s.version,
  };
}

/** Plans screen model: always gated in core; carries only the explanation key. */
export const recurringPlansVM = () => ({ gated: !RECURRING_CARE_GATE.enabled, reasonKey: `caretaker.plans.gated.${RECURRING_CARE_GATE.reason}` });
