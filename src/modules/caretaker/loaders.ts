import { fail, ok } from "@/lib/api/result";
import { metricFrom, toLoaderResult, type LoaderResult, type WorkspaceLoaderContext } from "@/modules/admin/access";
import { belongsToWorkspace, toCareActor } from "@/modules/admin/workspace";
import { getCaretakerApi } from "./index";
import type { CareTaskCode } from "./types";
import {
  toAssignmentRow,
  toCaregiverRow,
  toCareRequestRow,
  toServiceRow,
  toShiftRow,
  type AssignmentRowVM,
  type CaregiverRowVM,
  type CareRequestRowVM,
  type CaretakerDashboardVM,
  type ServiceRowVM,
  type ShiftRowVM,
} from "./view-models";

/** Server-side route loaders for the caretaker / agency area. */

const clock = (ctx: WorkspaceLoaderContext) => (ctx.now ? ctx.now() : new Date());
const api = (ctx: WorkspaceLoaderContext) => getCaretakerApi({ env: ctx.env, actor: toCareActor(ctx.workspace), now: ctx.now });

/** Asia/Kolkata is a fixed UTC+05:30 offset (no DST). */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** UTC instants bounding the Asia/Kolkata calendar day that contains `now`. */
export function istDayBounds(now: Date): { start: number; end: number } {
  const start = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return { start, end: start + DAY_MS };
}

/**
 * Assignments whose interval overlaps today (IST), including multi-day care that
 * started earlier. Returns null when any interval is unparseable, so the section
 * shows an error instead of a wrong count.
 */
export function countOverlappingToday(items: readonly { interval: { start: string; end: string } }[], now: Date): number | null {
  const { start, end } = istDayBounds(now);
  let count = 0;
  for (const a of items) {
    const s = Date.parse(a.interval.start);
    const e = Date.parse(a.interval.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (s < end && e > start) count += 1;
  }
  return count;
}

export async function loadCaretakerDashboard(ctx: WorkspaceLoaderContext): Promise<LoaderResult<CaretakerDashboardVM>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const now = clock(ctx);
  const seesRequests = actor.kind !== "agency_caregiver";
  const [requests, assignments] = await Promise.all([seesRequests ? care.listRequests() : null, care.listAssignments()]);
  const vm: CaretakerDashboardVM = {
    kind: actor.kind,
    pendingRequests: requests ? metricFrom(requests, (items) => items.filter((r) => r.bookingState === "requested").length) : null,
    todayAssignments: !assignments.ok
      ? metricFrom(assignments)
      : (() => {
          const n = countOverlappingToday(assignments.data, now);
          return n === null ? { kind: "unavailable" as const, reason: "error" as const } : { kind: "value" as const, value: n, lowerBound: false };
        })(),
    activeCare: metricFrom(assignments, (items) => items.filter((a) => a.substate === "started").length),
  };
  return toLoaderResult(ok(vm), care.mode);
}

export async function loadCareServices(ctx: WorkspaceLoaderContext): Promise<LoaderResult<ServiceRowVM[]>> {
  const care = api(ctx);
  const result = await care.listServices();
  if (result.ok && !belongsToWorkspace(result.data, ctx.workspace, (s) => s.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  return toLoaderResult(result.ok ? ok(result.data.map(toServiceRow)) : result, care.mode, (rows) => rows.length === 0);
}

export async function loadCareStaff(ctx: WorkspaceLoaderContext): Promise<LoaderResult<CaregiverRowVM[]>> {
  const care = api(ctx);
  const result = await care.listStaff();
  if (result.ok && !result.data.every((c) => c.agencyId === ctx.workspace.organizationId)) return toLoaderResult(fail("unavailable"), care.mode);
  return toLoaderResult(result.ok ? ok(result.data.map(toCaregiverRow)) : result, care.mode, (rows) => rows.length === 0);
}

export type CaregiverOption = { resourceId: string; label: string; skills: CareTaskCode[] | null };

/**
 * Requests plus caregivers who may be assigned. Agency managers get verified, active staff
 * (filtered per request by skills in the view); an independent caregiver can only assign
 * themselves (skills checked by the server).
 */
export async function loadCareRequests(
  ctx: WorkspaceLoaderContext,
): Promise<LoaderResult<{ rows: CareRequestRowVM[]; nextCursor: string | null; caregivers: CaregiverOption[] }>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const [result, staff] = await Promise.all([care.listRequests(), actor.kind === "agency_manager" ? care.listStaff() : null]);
  if (!result.ok) return toLoaderResult(result, care.mode);
  if (!belongsToWorkspace(result.data.items, ctx.workspace, (r) => r.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  const caregivers: CaregiverOption[] =
    actor.kind === "independent" && actor.resourceId
      ? [{ resourceId: actor.resourceId, label: ctx.workspace.displayName, skills: null }]
      : staff && staff.ok
        ? staff.data
            .filter((s) => s.membershipStatus === "active" && s.credentialStatus === "verified")
            .map((s) => ({ resourceId: s.resourceId, label: s.displayName, skills: s.skills }))
        : [];
  return toLoaderResult(
    ok({ rows: result.data.items.map(toCareRequestRow), nextCursor: result.data.nextCursor, caregivers }),
    care.mode,
    (d) => d.rows.length === 0,
  );
}

export async function loadAssignments(ctx: WorkspaceLoaderContext): Promise<LoaderResult<AssignmentRowVM[]>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const now = clock(ctx);
  const result = await care.listAssignments();
  if (result.ok && !belongsToWorkspace(result.data, ctx.workspace, (a) => a.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  return toLoaderResult(result.ok ? ok(result.data.map((a) => toAssignmentRow(a, actor, now))) : result, care.mode, (rows) => rows.length === 0);
}

export async function loadAssignmentDetail(ctx: WorkspaceLoaderContext, assignmentId: string): Promise<LoaderResult<{ assignment: AssignmentRowVM; shifts: ShiftRowVM[] | null }>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const [assignment, shifts] = await Promise.all([care.getAssignment(assignmentId), care.listShifts({ assignmentId })]);
  if (!assignment.ok) return toLoaderResult(assignment, care.mode);
  if (assignment.data.providerId !== ctx.workspace.providerId) return toLoaderResult(fail("not_found"), care.mode);
  return toLoaderResult(
    ok({ assignment: toAssignmentRow(assignment.data, actor, clock(ctx)), shifts: shifts.ok ? shifts.data.map((s) => toShiftRow(s, actor)) : null }),
    care.mode,
  );
}

export type ShiftGroup = { assignmentId: string; reference: string; shifts: ShiftRowVM[] };

/**
 * Shift view: shifts for every assignment visible to the actor, grouped by assignment,
 * plus verified active caregivers a manager may assign as replacements (server re-checks skills).
 */
export async function loadShifts(ctx: WorkspaceLoaderContext): Promise<LoaderResult<{ groups: ShiftGroup[]; replacements: { resourceId: string; label: string }[] }>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const [assignments, staff] = await Promise.all([care.listAssignments(), actor.kind === "agency_manager" ? care.listStaff() : null]);
  if (!assignments.ok) return toLoaderResult(assignments, care.mode);
  if (!belongsToWorkspace(assignments.data, ctx.workspace, (a) => a.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  const groups: ShiftGroup[] = [];
  for (const a of assignments.data) {
    const shifts = await care.listShifts({ assignmentId: a.id });
    if (!shifts.ok) return toLoaderResult(shifts, care.mode);
    if (shifts.data.length > 0) groups.push({ assignmentId: a.id, reference: a.reference, shifts: shifts.data.map((s) => toShiftRow(s, actor)) });
  }
  const replacements =
    staff && staff.ok
      ? staff.data.filter((s) => s.membershipStatus === "active" && s.credentialStatus === "verified").map((s) => ({ resourceId: s.resourceId, label: s.displayName }))
      : [];
  return toLoaderResult(ok({ groups, replacements }), care.mode, (d) => d.groups.length === 0);
}
