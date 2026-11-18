import { describe, expect, it } from "vitest";
import type { ApiResult } from "@/lib/api/result";
import { labActors, labFixtures } from "@/fixtures/operations/lab";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { listWorkspaces } from "@/modules/admin/workspace";
import { createLabFixtureApi } from "@/modules/lab/fixture";
import { loadLabBranches, loadLabCatalog, loadLabDashboard, loadLabOrderDetail, loadLabStaff } from "@/modules/lab/loaders";
import { applyReportEvent, collectionActionDenial, reportReleaseDenial, reportReviewDenial } from "@/modules/lab/rules";
import { describeActive, describeCredential, describeLabOrder, describeMembership } from "@/modules/lab/status";
import type { LabActor, LabReport } from "@/modules/lab/types";
import { toCatalogRow, toCollectionJob, toOrderDetail, toReportRow, toStaffRow } from "@/modules/lab/view-models";

const data = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
};
const code = <T>(r: ApiResult<T>) => (r.ok ? "ok" : r.error.code);
const order = (id: string) => structuredClone(labFixtures.orders.find((o) => o.id === id)!);
const report = (state: LabReport["state"]) => structuredClone(labFixtures.reports.find((r) => r.state === state)!);
const NOW = () => new Date("2026-11-20T03:00:00Z");
const CLINICAL = { FEATURE_CLINICAL: "true" };

describe("lab rules: remaining denial branches", () => {
  const scheduled = order("fx-lab-order-2");

  it("collection denials: inactive, other provider, bad reason, branch mismatch", () => {
    expect(collectionActionDenial({ ...labActors.collectorA, membershipStatus: "disabled" }, scheduled, "start_collection")).toBe("membership_inactive");
    expect(collectionActionDenial({ ...labActors.collectorA, providerId: "fx-other" }, scheduled, "start_collection")).toBe("wrong_provider");
    expect(collectionActionDenial({ ...labActors.collectorA, resourceId: null }, scheduled, "start_collection")).toBe("not_assigned");
    expect(collectionActionDenial(labActors.collectorA, scheduled, "record_collection_failed", { reason: "made_up" as never })).toBe("reason_required");
    const collected = { ...scheduled, substate: "collected" as const };
    expect(collectionActionDenial(labActors.collectorA, collected, "record_handoff", { branchId: "fx-lab-branch-2" })).toBe("branch_mismatch");
    expect(collectionActionDenial(labActors.collectorA, collected, "record_handoff", { branchId: "fx-lab-branch-1" })).toBeNull();
  });

  it("report denials: gate, inactive, other provider, wrong state", () => {
    const uploaded = report("uploaded");
    expect(reportReviewDenial({ actor: labActors.reviewer, report: uploaded, clinicalGateOn: false })).toBe("gate_off");
    expect(reportReviewDenial({ actor: { ...labActors.reviewer, membershipStatus: "invited" }, report: uploaded, clinicalGateOn: true })).toBe("membership_inactive");
    expect(reportReviewDenial({ actor: { ...labActors.reviewer, providerId: "fx-other" }, report: uploaded, clinicalGateOn: true })).toBe("wrong_provider");
    expect(reportReviewDenial({ actor: labActors.reviewer, report: report("reviewed"), clinicalGateOn: true })).toBe("invalid_state");
    expect(reportReleaseDenial({ actor: labActors.reviewer, report: { ...uploaded, state: "released" }, clinicalGateOn: true })).toBe("invalid_state");
  });

  it("applyReportEvent records the reviewer on review and refuses when gated", () => {
    const uploaded = report("uploaded");
    const ok = applyReportEvent(uploaded, { type: "reviewed_by_reviewer", actor: labActors.reviewer, at: "2026-11-20T00:00:00Z" }, true);
    expect(ok.report).toMatchObject({ state: "reviewed", reviewedByProfileId: labActors.reviewer.profileId, version: uploaded.version + 1 });
    const gated = applyReportEvent(uploaded, { type: "reviewed_by_reviewer", actor: labActors.reviewer, at: "x" }, false);
    expect(gated).toEqual({ report: uploaded, denial: "gate_off" });
  });
});

describe("lab fixture adapter: authorization and validation branches", () => {
  it("non-members are forbidden everywhere; collectors cannot list staff or orders", async () => {
    const outsider: LabActor = { ...labActors.manager, providerId: "fx-other" };
    const api = createLabFixtureApi({ env: {}, actor: outsider });
    expect(code(await api.listBranches())).toBe("forbidden");
    expect(code(await api.listCatalog())).toBe("forbidden");
    expect(code(await api.getOrder("fx-lab-order-2"))).toBe("not_found");
    const collector = createLabFixtureApi({ env: {}, actor: labActors.collectorA });
    expect(code(await collector.listStaff())).toBe("forbidden");
    expect(code(await collector.listOrders({ queue: "pending" }))).toBe("forbidden");
    expect(code(await createLabFixtureApi({ env: {}, actor: labActors.manager }).listAssignedCollections())).toBe("forbidden");
  });

  it("filters catalog and staff by branch, and queues by state and Kolkata day", async () => {
    const api = createLabFixtureApi({ env: {}, actor: labActors.manager, now: NOW });
    expect(data(await api.listCatalog({ branchId: "fx-lab-branch-2" })).map((i) => i.id)).toEqual(["fx-lab-test-cbc", "fx-lab-test-fbs", "fx-lab-package-basic"]);
    expect(data(await api.listStaff({ branchId: "fx-lab-branch-2" })).map((m) => m.membershipId)).toEqual(["fx-lab-m-1"]);
    expect(data(await api.listOrders({ queue: "today" })).items.map((o) => o.id)).toEqual(["fx-lab-order-2"]);
    expect(data(await api.listOrders({ queue: "processing" })).items.map((o) => o.id)).toEqual(["fx-lab-order-4"]);
    expect(data(await api.getOrder("fx-lab-order-4")).reference).toBe("#SCV-BKG-900104");
  });

  it("full collection flow ends in processing handoff; errors map to stable codes", async () => {
    const api = createLabFixtureApi({ env: {}, actor: labActors.collectorA, now: NOW });
    const step = (action: Parameters<typeof api.performCollectionAction>[0]["action"], v: number, key: string, extra = {}) =>
      api.performCollectionAction({ orderId: "fx-lab-order-2", action, expectedVersion: v, idempotencyKey: key, ...extra });
    expect(code(await api.performCollectionAction({ orderId: "nope", action: "start_collection", expectedVersion: 1, idempotencyKey: "n" }))).toBe("not_found");
    expect(code(await step("mark_collected", 3, "early"))).toBe("conflict");
    expect(code(await step("start_collection", 2, "stale"))).toBe("conflict");
    expect(await step("record_collection_failed", 3, "noreason")).toEqual({ ok: false, error: { code: "validation", fields: { reason: "required" } } });
    data(await step("start_collection", 3, "s1"));
    data(await step("mark_collected", 4, "s2"));
    expect(await step("record_handoff", 5, "s3", { branchId: "fx-lab-branch-2" })).toEqual({ ok: false, error: { code: "validation", fields: { branchId: "mismatch" } } });
    const done = data(await step("record_handoff", 5, "s4", { branchId: "fx-lab-branch-1" }));
    expect(done).toMatchObject({ substate: "processing_handoff", bookingState: "completed", version: 6 });
    expect(done.history.at(-1)?.substate).toBe("processing_handoff");
    const inactive = createLabFixtureApi({ env: {}, actor: { ...labActors.collectorA, membershipStatus: "disabled" } });
    expect(code(await inactive.performCollectionAction({ orderId: "fx-lab-order-2", action: "start_collection", expectedVersion: 3, idempotencyKey: "i" }))).toBe("forbidden");
  });

  it("failure records the reason code and interrupts the booking", async () => {
    const api = createLabFixtureApi({ env: {}, actor: labActors.collectorA, now: NOW });
    const failed = data(await api.performCollectionAction({ orderId: "fx-lab-order-2", action: "record_collection_failed", reason: "address_not_found", expectedVersion: 3, idempotencyKey: "f" }));
    expect(failed).toMatchObject({ substate: "collection_failed", bookingState: "interrupted", failure: { reason: "address_not_found", recordedAt: NOW().toISOString() } });
  });

  it("recollection: manager only, failed orders only, idempotent", async () => {
    expect(code(await createLabFixtureApi({ env: {}, actor: labActors.collectorB }).requestRecollection({ orderId: "fx-lab-order-3", idempotencyKey: "r" }))).toBe("forbidden");
    const api = createLabFixtureApi({ env: {}, actor: labActors.manager });
    expect(code(await api.requestRecollection({ orderId: "nope", idempotencyKey: "r0" }))).toBe("not_found");
    expect(code(await api.requestRecollection({ orderId: "fx-lab-order-2", idempotencyKey: "r1" }))).toBe("conflict");
    const first = await api.requestRecollection({ orderId: "fx-lab-order-3", idempotencyKey: "r2" });
    expect(await api.requestRecollection({ orderId: "fx-lab-order-3", idempotencyKey: "r2" })).toEqual(first);
    expect(data(await api.listOrders({ queue: "pending" })).items.filter((o) => o.recollectionOfOrderId === "fx-lab-order-3")).toHaveLength(1);
  });

  it("review: reviewer succeeds, uploader-reviewer is forbidden, stale version conflicts, unknown is not found", async () => {
    const api = createLabFixtureApi({ env: CLINICAL, actor: labActors.reviewer, now: NOW });
    expect(code(await api.reviewReport({ reportId: "fx-lab-report-1", expectedVersion: 9, idempotencyKey: "v0" }))).toBe("conflict");
    expect(data(await api.reviewReport({ reportId: "fx-lab-report-1", expectedVersion: 1, idempotencyKey: "v1" }))).toMatchObject({ state: "reviewed", reviewedByProfileId: labActors.reviewer.profileId });
    expect(code(await api.reviewReport({ reportId: "nope", expectedVersion: 1, idempotencyKey: "v2" }))).toBe("not_found");
    expect(code(await api.releaseReport({ reportId: "nope", expectedVersion: 1, idempotencyKey: "v3" }))).toBe("not_found");
    // The idempotency key "v1" was used for the successful review; a different key on the now-reviewed report conflicts.
    expect(code(await api.reviewReport({ reportId: "fx-lab-report-1", expectedVersion: 2, idempotencyKey: "v4" }))).toBe("conflict");
    const uploaderReviewer = createLabFixtureApi({ env: CLINICAL, actor: { ...labActors.manager, roles: ["manager", "reviewer"] } });
    expect(code(await uploaderReviewer.reviewReport({ reportId: "fx-lab-report-1", expectedVersion: 1, idempotencyKey: "u" }))).toBe("forbidden");
    expect(code(await createLabFixtureApi({ env: {}, actor: labActors.reviewer }).reviewReport({ reportId: "fx-lab-report-1", expectedVersion: 1, idempotencyKey: "g" }))).toBe("gated");
    expect(data(await api.listReports({ state: "reviewed" })).map((r) => r.id).sort()).toEqual(["fx-lab-report-1", "fx-lab-report-2"]);
  });
});

describe("lab status and view models", () => {
  it("order badge prefers terminal booking states and keeps unknowns unknown", () => {
    expect(describeLabOrder({ substate: "scheduled", bookingState: "cancelled" }).labelKey).toBe("lab.status.order.cancelled");
    expect(describeLabOrder({ substate: null, bookingState: "requested" }).labelKey).toBe("lab.status.order.requested");
    expect(describeLabOrder({ substate: null, bookingState: "completed" }).known).toBe(false);
    expect(describeActive("true").known).toBe(false);
    expect(describeActive(false).labelKey).toBe("lab.status.catalog.inactive");
    expect(describeCredential("approved").known).toBe(false);
    expect(describeMembership("active").tone).toBe("success");
  });

  it("view models hide unapproved turnaround and map history, staff branches and blocked release", () => {
    const item = labFixtures.catalog[0];
    expect(toCatalogRow(item).turnaroundHours).toBeNull();
    expect(toCatalogRow({ ...item, turnaroundDisplayApproved: true }).turnaroundHours).toBe(24);
    expect(toStaffRow(labFixtures.staff[0], labFixtures.branches).branchNames).toEqual(["Synthetic Lab Branch North", "Synthetic Lab Branch South"]);
    const detail = toOrderDetail(order("fx-lab-order-3"));
    expect(detail.history.map((h) => h.status.labelKey)).toEqual([
      "lab.status.order.requested",
      "lab.status.collection.scheduled",
      "lab.status.collection.collecting",
      "lab.status.collection.collectionFailed",
    ]);
    expect(detail).toMatchObject({ failureReasonKey: "lab.failure.preparation_not_followed", canRequestRecollection: true, isRecollection: false });
    expect(toCollectionJob(order("fx-lab-order-4"), labActors.collectorA).actions).toEqual([]);
    expect(toReportRow(report("reviewed"), labActors.reviewer, false)).toMatchObject({ canRelease: false, releaseBlockedKey: "lab.reports.blocked.gate_off" });
    expect(toReportRow({ ...report("reviewed"), state: "released" }, labActors.reviewer, true).releaseBlockedKey).toBeNull();
  });
});

describe("lab loaders: list pages", () => {
  const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
  const ctx = { workspace: listWorkspaces(W.labManager)[0], env: FX, now: NOW };

  it("branches, catalog, staff and order detail load for the manager", async () => {
    const branches = await loadLabBranches(ctx);
    expect(branches.status === "ok" && branches.data.map((b) => b.canToggleActive)).toEqual([true, false]);
    const catalog = await loadLabCatalog(ctx, "fx-lab-branch-1");
    expect(catalog.status === "ok" && catalog.data).toHaveLength(4);
    const staff = await loadLabStaff(ctx);
    expect(staff.status === "ok" && staff.data).toHaveLength(5);
    const detail = await loadLabOrderDetail(ctx, "fx-lab-order-2");
    expect(detail.status === "ok" && detail.data.totalsConsistent).toBe(true);
    expect(await loadLabOrderDetail(ctx, "missing")).toEqual({ status: "not_found" });
  });

  it("http mode dashboard shows every metric as gated, never zero", async () => {
    const res = await loadLabDashboard({ ...ctx, env: {} });
    if (res.status !== "ok" || !res.data.manager) throw new Error("expected manager section");
    expect(res.fixture).toBe(false);
    expect(res.data.manager.pending).toEqual({ kind: "unavailable", reason: "gated" });
    expect(res.data.manager.branches).toBeNull();
  });
});
