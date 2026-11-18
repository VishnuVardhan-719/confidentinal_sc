import { fail, ok } from "@/lib/api/result";
import { metricFrom, toLoaderResult, type LoaderResult, type WorkspaceLoaderContext } from "@/modules/admin/access";
import { belongsToWorkspace, toCareActor } from "@/modules/admin/workspace";
import { getCaretakerApi } from "./index";
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

const kolkataDay = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export async function loadCaretakerDashboard(ctx: WorkspaceLoaderContext): Promise<LoaderResult<CaretakerDashboardVM>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const today = kolkataDay(clock(ctx));
  const seesRequests = actor.kind !== "agency_caregiver";
  const [requests, assignments] = await Promise.all([seesRequests ? care.listRequests() : null, care.listAssignments()]);
  const vm: CaretakerDashboardVM = {
    kind: actor.kind,
    pendingRequests: requests ? metricFrom(requests, (items) => items.filter((r) => r.bookingState === "requested").length) : null,
    todayAssignments: metricFrom(assignments, (items) => items.filter((a) => kolkataDay(a.interval.start) === today).length),
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

export async function loadCareRequests(ctx: WorkspaceLoaderContext): Promise<LoaderResult<{ rows: CareRequestRowVM[]; nextCursor: string | null }>> {
  const care = api(ctx);
  const result = await care.listRequests();
  if (!result.ok) return toLoaderResult(result, care.mode);
  if (!belongsToWorkspace(result.data.items, ctx.workspace, (r) => r.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  return toLoaderResult(ok({ rows: result.data.items.map(toCareRequestRow), nextCursor: result.data.nextCursor }), care.mode, (d) => d.rows.length === 0);
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

/** Shift view: shifts for every assignment visible to the actor, grouped by assignment. */
export async function loadShifts(ctx: WorkspaceLoaderContext): Promise<LoaderResult<{ assignmentId: string; reference: string; shifts: ShiftRowVM[] }[]>> {
  const care = api(ctx);
  const actor = toCareActor(ctx.workspace);
  const assignments = await care.listAssignments();
  if (!assignments.ok) return toLoaderResult(assignments, care.mode);
  if (!belongsToWorkspace(assignments.data, ctx.workspace, (a) => a.providerId)) return toLoaderResult(fail("unavailable"), care.mode);
  const groups = [];
  for (const a of assignments.data) {
    const shifts = await care.listShifts({ assignmentId: a.id });
    if (!shifts.ok) return toLoaderResult(shifts, care.mode);
    if (shifts.data.length > 0) groups.push({ assignmentId: a.id, reference: a.reference, shifts: shifts.data.map((s) => toShiftRow(s, actor)) });
  }
  return toLoaderResult(ok(groups), care.mode, (g) => g.length === 0);
}
