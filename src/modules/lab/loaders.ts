import { fail, ok, type ApiResult } from "@/lib/api/result";
import { isEnabled } from "@/lib/feature-flags";
import { metricFrom, toLoaderResult, type LoaderResult, type WorkspaceLoaderContext } from "@/modules/admin/access";
import { belongsToWorkspace, toLabActor } from "@/modules/admin/workspace";
import type { LabOrderQueue } from "./api";
import { getLabApi } from "./index";
import type { LabOrder, LabReport } from "./types";
import {
  toBranchRow,
  toCatalogRow,
  toCollectionJob,
  toOrderDetail,
  toOrderRow,
  toReportRow,
  toStaffRow,
  type BranchRowVM,
  type CatalogRowVM,
  type CollectionJobVM,
  type LabDashboardVM,
  type OrderDetailVM,
  type OrderRowVM,
  type ReportRowVM,
  type StaffRowVM,
} from "./view-models";

/**
 * Server-side route loaders for the lab area. Each one runs after the route
 * guard allowed the request for exactly one workspace, calls the typed lab
 * API, and returns a LoaderResult the page renders (ok/empty/denied/gated/error).
 */

function api(ctx: WorkspaceLoaderContext) {
  return getLabApi({ env: ctx.env, actor: toLabActor(ctx.workspace), now: ctx.now });
}

/** Rows from another provider mean the response is not trustworthy for this workspace. */
function sameWorkspace<T extends { providerId: string }>(ctx: WorkspaceLoaderContext, result: ApiResult<T[]>): ApiResult<T[]> {
  if (!result.ok) return result;
  return belongsToWorkspace(result.data, ctx.workspace, (r) => r.providerId) ? result : fail("unavailable");
}

export async function loadLabDashboard(ctx: WorkspaceLoaderContext): Promise<LoaderResult<LabDashboardVM>> {
  const lab = api(ctx);
  const actor = toLabActor(ctx.workspace);
  const isManager = actor.roles.includes("manager");
  const isCollector = actor.roles.includes("collector");
  const isReviewer = actor.roles.includes("reviewer");

  const queue = (q: LabOrderQueue) => lab.listOrders({ queue: q });
  const [today, pending, processing, exceptions, branches, assigned, reports] = await Promise.all([
    isManager ? queue("today") : null,
    isManager ? queue("pending") : null,
    isManager ? queue("processing") : null,
    isManager ? queue("exceptions") : null,
    isManager ? lab.listBranches() : null,
    isCollector ? lab.listAssignedCollections() : null,
    isReviewer ? lab.listReports() : null,
  ]);

  const vm: LabDashboardVM = {
    roles: actor.roles,
    manager:
      isManager && today && pending && processing && exceptions && branches
        ? {
            today: metricFrom(today),
            pending: metricFrom(pending),
            processing: metricFrom(processing),
            exceptions: metricFrom(exceptions),
            branches: branches.ok ? branches.data.map(toBranchRow) : null,
          }
        : null,
    collector: isCollector && assigned ? { assigned: metricFrom(assigned) } : null,
    reviewer:
      isReviewer && reports
        ? {
            awaitingReview: metricFrom<LabReport>(reports, (items) => items.filter((r) => r.state === "uploaded").length),
            awaitingRelease: metricFrom<LabReport>(reports, (items) => items.filter((r) => r.state === "reviewed").length),
          }
        : null,
  };
  return toLoaderResult(ok(vm), lab.mode);
}

export async function loadLabBranches(ctx: WorkspaceLoaderContext): Promise<LoaderResult<BranchRowVM[]>> {
  const lab = api(ctx);
  const result = await lab.listBranches();
  return toLoaderResult(result.ok ? ok(result.data.map(toBranchRow)) : result, lab.mode, (rows) => rows.length === 0);
}

export async function loadLabCatalog(ctx: WorkspaceLoaderContext, branchId?: string): Promise<LoaderResult<CatalogRowVM[]>> {
  const lab = api(ctx);
  const result = await lab.listCatalog(branchId === undefined ? {} : { branchId });
  return toLoaderResult(result.ok ? ok(result.data.map(toCatalogRow)) : result, lab.mode, (rows) => rows.length === 0);
}

export async function loadLabStaff(ctx: WorkspaceLoaderContext): Promise<LoaderResult<StaffRowVM[]>> {
  const lab = api(ctx);
  const [staff, branches] = await Promise.all([lab.listStaff(), lab.listBranches()]);
  if (!staff.ok) return toLoaderResult(staff, lab.mode);
  const known = branches.ok ? branches.data : [];
  return toLoaderResult(ok(staff.data.map((m) => toStaffRow(m, known))), lab.mode, (rows) => rows.length === 0);
}

export async function loadLabOrders(ctx: WorkspaceLoaderContext, queue: LabOrderQueue): Promise<LoaderResult<{ rows: OrderRowVM[]; nextCursor: string | null }>> {
  const lab = api(ctx);
  const result = await lab.listOrders({ queue });
  if (!result.ok) return toLoaderResult(result, lab.mode);
  const checked = sameWorkspace<LabOrder>(ctx, ok(result.data.items));
  if (!checked.ok) return toLoaderResult(checked, lab.mode);
  return toLoaderResult(ok({ rows: checked.data.map(toOrderRow), nextCursor: result.data.nextCursor }), lab.mode, (d) => d.rows.length === 0);
}

export async function loadLabOrderDetail(ctx: WorkspaceLoaderContext, orderId: string): Promise<LoaderResult<OrderDetailVM>> {
  const lab = api(ctx);
  const result = await lab.getOrder(orderId);
  if (result.ok && result.data.providerId !== ctx.workspace.providerId) return toLoaderResult(fail("not_found"), lab.mode);
  return toLoaderResult(result.ok ? ok(toOrderDetail(result.data)) : result, lab.mode);
}

export async function loadLabCollections(ctx: WorkspaceLoaderContext): Promise<LoaderResult<CollectionJobVM[]>> {
  const lab = api(ctx);
  const actor = toLabActor(ctx.workspace);
  const result = sameWorkspace<LabOrder>(ctx, await lab.listAssignedCollections());
  return toLoaderResult(result.ok ? ok(result.data.map((o) => toCollectionJob(o, actor))) : result, lab.mode, (rows) => rows.length === 0);
}

export async function loadLabReports(ctx: WorkspaceLoaderContext): Promise<LoaderResult<ReportRowVM[]>> {
  const lab = api(ctx);
  const actor = toLabActor(ctx.workspace);
  const gateOn = isEnabled("clinical", ctx.env ?? process.env);
  const result = sameWorkspace<LabReport>(ctx, await lab.listReports());
  return toLoaderResult(result.ok ? ok(result.data.map((r) => toReportRow(r, actor, gateOn))) : result, lab.mode, (rows) => rows.length === 0);
}
