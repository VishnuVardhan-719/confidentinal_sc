import { fail, ok, type ApiResult } from "@/lib/api/result";
import { careActors, caretakerFixtures } from "@/fixtures/operations/caretaker";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import type { CaretakerApi } from "./api";
import { careActionDenial, nextCareSubstate, nextShiftAttendance, replacementAllowed, visibleAssignments } from "./rules";
import type { CareActor, CareAssignment, CareShift } from "./types";

export type CaretakerFixtureOptions = {
  env?: Record<string, string | undefined>;
  actor?: CareActor;
  now?: () => Date;
};

/** Synthetic caretaker adapter. Simulates server authorization; refuses production. */
export function createCaretakerFixtureApi(options: CaretakerFixtureOptions = {}): CaretakerApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const actor: CareActor = options.actor ?? careActors.agencyManager;
  const now = options.now ?? (() => new Date());
  const data = cloneFixture(caretakerFixtures);
  const once = createReplayCache();

  const active = () => actor.membershipStatus === "active";
  const isManager = () => active() && actor.kind === "agency_manager" && actor.agencyId !== null;
  const canSeeRequests = () => active() && (actor.kind === "agency_manager" || actor.kind === "independent");
  const visible = (assignmentId: string): CareAssignment | undefined =>
    visibleAssignments(actor, data.assignments).find((a) => a.id === assignmentId);
  const ownShift = (shift: CareShift) => actor.resourceId !== null && shift.caregiver.resourceId === actor.resourceId;
  const shiftInScope = (shiftId: string): CareShift | undefined => {
    const shift = data.shifts.find((s) => s.id === shiftId);
    if (!shift || !visible(shift.assignmentId)) return undefined;
    return isManager() || ownShift(shift) ? shift : undefined;
  };

  function shiftStep(
    op: string,
    input: { shiftId: string; expectedVersion: number; idempotencyKey: string },
    step: "check_in" | "check_out" | "absent",
    mutate: (shift: CareShift, at: string) => void,
    allowManager: boolean,
  ): ApiResult<CareShift> {
    return once(op, input.idempotencyKey, (): ApiResult<CareShift> => {
      const shift = shiftInScope(input.shiftId);
      if (!shift) return fail("not_found");
      if (!ownShift(shift) && !(allowManager && isManager())) return fail("forbidden");
      const next = nextShiftAttendance(shift.attendance, step);
      if (next === null || shift.version !== input.expectedVersion) return fail("conflict");
      shift.attendance = next;
      mutate(shift, now().toISOString()); // server timestamp, never client-supplied
      shift.version += 1;
      return ok(cloneFixture(shift));
    });
  }

  return {
    mode: "fixture",

    async listServices() {
      return active() ? ok(data.services.filter((s) => s.providerId === actor.providerId)) : fail("forbidden");
    },
    async listStaff() {
      return isManager() ? ok(data.staff.filter((s) => s.agencyId === actor.agencyId)) : fail("forbidden");
    },
    async listRequests() {
      return canSeeRequests()
        ? ok({ items: data.requests.filter((r) => r.providerId === actor.providerId), nextCursor: null })
        : fail("forbidden");
    },
    async listAssignments() {
      return active() ? ok(visibleAssignments(actor, data.assignments)) : fail("forbidden");
    },
    async getAssignment(assignmentId) {
      const found = visible(assignmentId);
      return found ? ok(found) : fail("not_found");
    },
    async performCareAction(input) {
      return once("care", input.idempotencyKey, (): ApiResult<CareAssignment> => {
        const assignment = visible(input.assignmentId);
        if (!assignment) return fail("not_found");
        const denial = careActionDenial(actor, assignment, input.action, { reason: input.reason, now: now() });
        if (denial === "membership_inactive" || denial === "not_assigned") return fail("forbidden");
        if (denial === "invalid_transition" || denial === "too_early") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (assignment.version !== input.expectedVersion) return fail("conflict");
        const next = nextCareSubstate(assignment.substate, input.action);
        if (next === null) return fail("conflict");
        assignment.substate = next;
        if (input.action === "interrupt" && input.reason) assignment.interruption = { reason: input.reason, recordedAt: now().toISOString() };
        assignment.version += 1;
        return ok(cloneFixture(assignment));
      });
    },
    async listShifts({ assignmentId }) {
      if (!visible(assignmentId)) return fail("not_found");
      return ok(data.shifts.filter((s) => s.assignmentId === assignmentId && (isManager() || ownShift(s))));
    },
    async checkIn(input) {
      return shiftStep("check_in", input, "check_in", (s, at) => { s.checkInAt = at; }, false);
    },
    async checkOut(input) {
      return shiftStep("check_out", input, "check_out", (s, at) => { s.checkOutAt = at; }, false);
    },
    async reportAbsence(input) {
      return shiftStep("absent", input, "absent", (s, at) => { s.absence = { reason: input.reason, recordedAt: at }; }, true);
    },
    async assignReplacement(input) {
      return once("replace", input.idempotencyKey, (): ApiResult<CareShift> => {
        if (!isManager()) return fail("forbidden");
        const shift = shiftInScope(input.shiftId);
        const assignment = shift ? visible(shift.assignmentId) : undefined;
        if (!shift || !assignment) return fail("not_found");
        if (shift.version !== input.expectedVersion) return fail("conflict");
        const replacement = data.staff.find((s) => s.resourceId === input.replacementResourceId);
        if (!replacement || !replacementAllowed(shift, replacement, actor.agencyId, assignment.taskCodes)) {
          return fail("validation", { fields: { replacementResourceId: "not_eligible" } });
        }
        shift.attendance = "replaced";
        shift.replacement = { resourceId: replacement.resourceId, displayName: replacement.displayName, assignedAt: now().toISOString() };
        shift.version += 1;
        return ok(cloneFixture(shift));
      });
    },
    async createRecurringPlan() {
      // Hard gate; the fixture must not pretend recurring scheduling exists.
      return fail("gated");
    },
  };
}
