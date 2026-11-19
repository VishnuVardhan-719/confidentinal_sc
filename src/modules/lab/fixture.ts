import { operationsClock } from "@/modules/admin/clock";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { isEnabled } from "@/lib/feature-flags";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import { labActors, labFixtures } from "@/fixtures/operations/lab";
import type { LabApi, LabOrderQueue } from "./api";
import {
  branchToggleAllowed,
  canRequestRecollection,
  catalogUpdateSchema,
  collectionActionDenial,
  isTerminalSubstate,
  nextCollectionSubstate,
  reportReleaseDenial,
  reportReviewDenial,
  type ReportDenial,
} from "./rules";
import type { LabActor, LabBranch, LabCatalogItem, LabOrder, LabReport } from "./types";

/** Mutable synthetic state. Shared per process in fixture mode so changes survive a page refresh. */
export type LabFixtureStore = ReturnType<typeof createLabFixtureStore>;

export function createLabFixtureStore() {
  return { ...cloneFixture(labFixtures), nextReference: 900200 };
}

export type LabFixtureOptions = {
  env?: Record<string, string | undefined>;
  /** Synthetic signed-in staff member the fixture "server" authorizes. */
  actor?: LabActor;
  now?: () => Date;
  store?: LabFixtureStore;
};

const kolkataDay = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

function reportFailure(denial: ReportDenial): ApiResult<never> {
  if (denial === "gate_off") return fail("gated");
  if (denial === "invalid_state") return fail("conflict");
  return fail("forbidden");
}

/** Synthetic lab adapter. Simulates server authorization; refuses production. */
export function createLabFixtureApi(options: LabFixtureOptions = {}): LabApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const actor: LabActor = options.actor ?? labActors.manager;
  const now = options.now ?? operationsClock(env);
  const data = options.store ?? createLabFixtureStore();
  const once = createReplayCache();

  const isMember = () => actor.membershipStatus === "active" && actor.providerId === data.providerId;
  const isManager = () => isMember() && actor.roles.includes("manager");
  const clinicalOn = () => isEnabled("clinical", env);
  const visibleOrder = (order: LabOrder) =>
    isManager() || (isMember() && actor.resourceId !== null && order.assignedCollector?.resourceId === actor.resourceId);

  const inQueue = (order: LabOrder, queue: LabOrderQueue): boolean => {
    switch (queue) {
      case "pending":
        return order.bookingState === "requested";
      case "today":
        return (
          (order.substate === "scheduled" || order.substate === "collecting" || order.substate === "collected") &&
          kolkataDay(new Date(order.schedule.windowStart)) === kolkataDay(now())
        );
      case "scheduled":
        return order.substate === "scheduled" || order.substate === "collecting";
      case "processing":
        return order.substate === "collected" || order.substate === "processing_handoff";
      case "exceptions":
        return order.substate === "collection_failed" || order.substate === "handoff_failed";
    }
  };

  const findReport = (id: string): LabReport | undefined => data.reports.find((r) => r.id === id);

  return {
    mode: "fixture",

    async listBranches() {
      return isMember() ? ok(data.branches) : fail("forbidden");
    },

    async listCatalog(input = {}) {
      if (!isMember()) return fail("forbidden");
      return ok(data.catalog.filter((item) => input.branchId === undefined || item.branchId === null || item.branchId === input.branchId));
    },

    async listStaff(input = {}) {
      if (!isManager()) return fail("forbidden");
      return ok(data.staff.filter((m) => input.branchId === undefined || m.branchIds.includes(input.branchId)));
    },

    async setBranchActive(input) {
      return once("branch", input.idempotencyKey, (): ApiResult<LabBranch> => {
        if (!isManager()) return fail("forbidden");
        const branch = data.branches.find((b) => b.id === input.branchId);
        if (!branch) return fail("not_found");
        if (branch.version !== input.expectedVersion) return fail("conflict");
        if (!branchToggleAllowed(branch.verification, input.active)) return fail("conflict");
        branch.active = input.active;
        branch.version += 1;
        return ok(cloneFixture(branch));
      });
    },

    async updateCatalogItem(input) {
      return once("catalog", input.idempotencyKey, (): ApiResult<LabCatalogItem> => {
        if (!isManager()) return fail("forbidden");
        const item = data.catalog.find((i) => i.id === input.itemId);
        if (!item) return fail("not_found");
        const parsed = catalogUpdateSchema.safeParse({ pricePaise: input.pricePaise, preparation: input.preparation, active: input.active });
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "body")] = issue.message === "html_forbidden" ? "html_forbidden" : "invalid";
          return fail("validation", { fields });
        }
        if (item.version !== input.expectedVersion) return fail("conflict");
        Object.assign(item, parsed.data, { version: item.version + 1 });
        return ok(cloneFixture(item));
      });
    },

    async listOrders({ queue }) {
      if (!isManager()) return fail("forbidden");
      return ok({ items: data.orders.filter((o) => inQueue(o, queue)), nextCursor: null });
    },

    async getOrder(orderId) {
      const order = data.orders.find((o) => o.id === orderId);
      // Privacy-safe: an order the actor may not see is indistinguishable from a missing one.
      return order && visibleOrder(order) ? ok(order) : fail("not_found");
    },

    async listAssignedCollections() {
      if (!isMember() || !actor.roles.includes("collector") || actor.resourceId === null) return fail("forbidden");
      return ok(
        data.orders.filter((o) => o.assignedCollector?.resourceId === actor.resourceId && !isTerminalSubstate(o.substate) && o.substate !== null),
      );
    },

    async performCollectionAction(input) {
      return once("collection", input.idempotencyKey, (): ApiResult<LabOrder> => {
        const order = data.orders.find((o) => o.id === input.orderId);
        if (!order) return fail("not_found");
        const denial = collectionActionDenial(actor, order, input.action, { reason: input.reason, branchId: input.branchId });
        if (denial === "not_assigned" || denial === "wrong_provider") return fail("not_found");
        if (denial === "membership_inactive" || denial === "not_collector") return fail("forbidden");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (denial === "branch_mismatch") return fail("validation", { fields: { branchId: "mismatch" } });
        if (order.version !== input.expectedVersion) return fail("conflict");
        const next = nextCollectionSubstate(order.substate, input.action);
        if (next === null) return fail("conflict");
        const at = now().toISOString();
        order.substate = next;
        order.bookingState =
          next === "processing_handoff" ? "completed" : next === "collection_failed" || next === "handoff_failed" ? "interrupted" : "in_progress";
        if (input.reason && (next === "collection_failed" || next === "handoff_failed")) order.failure = { reason: input.reason, recordedAt: at };
        order.history.push({ substate: next, at });
        order.version += 1;
        return ok(cloneFixture(order));
      });
    },

    async requestRecollection(input) {
      return once("recollect", input.idempotencyKey, (): ApiResult<{ newOrderReference: string }> => {
        if (!isManager()) return fail("forbidden");
        const order = data.orders.find((o) => o.id === input.orderId);
        if (!order) return fail("not_found");
        if (!canRequestRecollection(order)) return fail("conflict");
        data.nextReference += 1;
        const referenceSeq = data.nextReference;
        const at = now().toISOString();
        const created: LabOrder = {
          ...cloneFixture(order),
          id: `fx-lab-order-r${referenceSeq}`,
          reference: `#SCV-BKG-${referenceSeq}`,
          bookingState: "requested",
          substate: null,
          assignedCollector: null,
          failure: null,
          recollectionOfOrderId: order.id,
          history: [{ substate: "requested", at }],
          version: 1,
        };
        data.orders.push(created);
        return ok({ newOrderReference: created.reference });
      });
    },

    async listReports(input = {}) {
      if (!clinicalOn()) return fail("gated");
      if (!isMember() || !actor.roles.includes("reviewer")) return fail("forbidden");
      return ok(data.reports.filter((r) => input.state === undefined || r.state === input.state));
    },

    async reviewReport(input) {
      return once("review", input.idempotencyKey, (): ApiResult<LabReport> => {
        if (!clinicalOn()) return fail("gated");
        const report = findReport(input.reportId);
        if (!report) return fail("not_found");
        const denial = reportReviewDenial({ actor, report, clinicalGateOn: true });
        if (denial) return reportFailure(denial);
        if (report.version !== input.expectedVersion) return fail("conflict");
        Object.assign(report, { state: "reviewed", reviewedByProfileId: actor.profileId, reviewedAt: now().toISOString(), version: report.version + 1 });
        return ok(cloneFixture(report));
      });
    },

    async releaseReport(input) {
      return once("release", input.idempotencyKey, (): ApiResult<LabReport> => {
        if (!clinicalOn()) return fail("gated");
        const report = findReport(input.reportId);
        if (!report) return fail("not_found");
        const denial = reportReleaseDenial({ actor, report, clinicalGateOn: true });
        if (denial) return reportFailure(denial);
        if (report.version !== input.expectedVersion) return fail("conflict");
        Object.assign(report, { state: "released", releasedByProfileId: actor.profileId, releasedAt: now().toISOString(), version: report.version + 1 });
        return ok(cloneFixture(report));
      });
    },
  };
}
