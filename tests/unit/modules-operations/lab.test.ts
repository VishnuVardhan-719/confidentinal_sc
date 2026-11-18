import { describe, expect, it } from "vitest";
import { labActors, labFixtures } from "@/fixtures/operations/lab";
import { createLabFixtureApi } from "@/modules/lab/fixture";
import { createLabHttpApi } from "@/modules/lab/http";
import {
  applyReportEvent,
  canRequestRecollection,
  collectionActionDenial,
  nextCollectionSubstate,
  orderTotalsConsistent,
  reportReleaseDenial,
  reportReviewDenial,
} from "@/modules/lab/rules";
import { describeCollection, describeReport } from "@/modules/lab/status";
import type { LabReport } from "@/modules/lab/types";

const CLINICAL_ON = { FEATURE_CLINICAL: "true" };
const reviewed = labFixtures.reports.find((r) => r.state === "reviewed") as LabReport;
const uploaded = labFixtures.reports.find((r) => r.state === "uploaded") as LabReport;
const order = (id: string) => structuredClone(labFixtures.orders.find((o) => o.id === id)!);

describe("lab report release gating", () => {
  it("is gated while the clinical gate is off, even for a reviewer", async () => {
    expect(reportReleaseDenial({ actor: labActors.reviewer, report: reviewed, clinicalGateOn: false })).toBe("gate_off");
    const api = createLabFixtureApi({ env: {}, actor: labActors.reviewer });
    const result = await api.releaseReport({ reportId: reviewed.id, expectedVersion: reviewed.version, idempotencyKey: "k1" });
    expect(result).toEqual({ ok: false, error: { code: "gated" } });
    expect((await api.listReports()).ok).toBe(false);
  });

  it("releases only a reviewed report, only by a reviewer, when the gate is on", async () => {
    const api = createLabFixtureApi({ env: CLINICAL_ON, actor: labActors.reviewer });
    const early = await api.releaseReport({ reportId: uploaded.id, expectedVersion: uploaded.version, idempotencyKey: "k2" });
    expect(early).toEqual({ ok: false, error: { code: "conflict" } });
    const released = await api.releaseReport({ reportId: reviewed.id, expectedVersion: reviewed.version, idempotencyKey: "k3" });
    expect(released.ok && released.data.state).toBe("released");
    expect(released.ok && released.data.releasedByProfileId).toBe(labActors.reviewer.profileId);
  });

  it("rejects a stale version", async () => {
    const api = createLabFixtureApi({ env: CLINICAL_ON, actor: labActors.reviewer });
    const result = await api.releaseReport({ reportId: reviewed.id, expectedVersion: reviewed.version - 1, idempotencyKey: "k4" });
    expect(result).toEqual({ ok: false, error: { code: "conflict" } });
  });

  it("denies self-review by the uploader", () => {
    const uploaderAsReviewer = { ...labActors.manager, roles: ["manager", "reviewer"] as const };
    expect(reportReviewDenial({ actor: uploaderAsReviewer, report: uploaded, clinicalGateOn: true })).toBe("self_review");
    expect(reportReviewDenial({ actor: labActors.reviewer, report: uploaded, clinicalGateOn: true })).toBeNull();
  });

  it("never releases because of payment, collection or upload events", () => {
    for (const event of [
      { type: "payment_status_changed", paymentStatus: "paid" },
      { type: "collection_completed" },
      { type: "file_uploaded" },
    ] as const) {
      const after = applyReportEvent(reviewed, event, true);
      expect(after.report.state).toBe("reviewed");
      expect(after.report.releasedAt).toBeNull();
    }
  });
});

describe("collector cannot release", () => {
  it("rule denies a collector-only member at every report step", () => {
    expect(reportReleaseDenial({ actor: labActors.collectorA, report: reviewed, clinicalGateOn: true })).toBe("not_reviewer");
    expect(reportReviewDenial({ actor: labActors.collectorA, report: uploaded, clinicalGateOn: true })).toBe("not_reviewer");
    const viaEvent = applyReportEvent(reviewed, { type: "released_by_reviewer", actor: labActors.collectorA, at: "2026-11-20T00:00:00Z" }, true);
    expect(viaEvent.denial).toBe("not_reviewer");
    expect(viaEvent.report.state).toBe("reviewed");
  });

  it("fixture API returns forbidden for a collector", async () => {
    const api = createLabFixtureApi({ env: CLINICAL_ON, actor: labActors.collectorA });
    const result = await api.releaseReport({ reportId: reviewed.id, expectedVersion: reviewed.version, idempotencyKey: "c1" });
    expect(result).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await api.listReports()).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("lab collection actions", () => {
  it("follows S01 transitions and never resets terminal states", () => {
    expect(nextCollectionSubstate("scheduled", "start_collection")).toBe("collecting");
    expect(nextCollectionSubstate("collecting", "mark_collected")).toBe("collected");
    expect(nextCollectionSubstate("collected", "record_handoff")).toBe("processing_handoff");
    expect(nextCollectionSubstate("scheduled", "mark_collected")).toBeNull();
    expect(nextCollectionSubstate("collection_failed", "start_collection")).toBeNull();
    expect(nextCollectionSubstate("processing_handoff", "record_collection_failed")).toBeNull();
  });

  it("only the assigned collector may act; failures need a reason code", () => {
    const scheduled = order("fx-lab-order-2");
    expect(collectionActionDenial(labActors.collectorA, scheduled, "start_collection")).toBeNull();
    expect(collectionActionDenial(labActors.collectorB, scheduled, "start_collection")).toBe("not_assigned");
    expect(collectionActionDenial(labActors.manager, scheduled, "start_collection")).toBe("not_collector");
    expect(collectionActionDenial(labActors.collectorA, scheduled, "record_collection_failed")).toBe("reason_required");
  });

  it("fixture: assigned collector progresses, another collector sees not_found", async () => {
    const mine = createLabFixtureApi({ env: {}, actor: labActors.collectorA, now: () => new Date("2026-11-20T02:40:00Z") });
    const started = await mine.performCollectionAction({ orderId: "fx-lab-order-2", action: "start_collection", expectedVersion: 3, idempotencyKey: "s1" });
    expect(started.ok && started.data.substate).toBe("collecting");
    expect(started.ok && started.data.bookingState).toBe("in_progress");
    const replay = await mine.performCollectionAction({ orderId: "fx-lab-order-2", action: "start_collection", expectedVersion: 3, idempotencyKey: "s1" });
    expect(replay).toEqual(started);

    const other = createLabFixtureApi({ env: {}, actor: labActors.collectorB });
    const denied = await other.performCollectionAction({ orderId: "fx-lab-order-2", action: "start_collection", expectedVersion: 3, idempotencyKey: "s2" });
    expect(denied).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await other.getOrder("fx-lab-order-2")).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("recollection creates a new requested booking and leaves the failed order unchanged", async () => {
    const failed = order("fx-lab-order-3");
    expect(canRequestRecollection(failed)).toBe(true);
    const api = createLabFixtureApi({ env: {}, actor: labActors.manager });
    const result = await api.requestRecollection({ orderId: failed.id, idempotencyKey: "r1" });
    expect(result.ok).toBe(true);
    const original = await api.getOrder(failed.id);
    expect(original.ok && original.data.substate).toBe("collection_failed");
    const pending = await api.listOrders({ queue: "pending" });
    expect(pending.ok && pending.data.items.some((o) => o.recollectionOfOrderId === failed.id && o.bookingState === "requested")).toBe(true);
  });

  it("server totals must add up", () => {
    expect(orderTotalsConsistent(order("fx-lab-order-2"))).toBe(true);
    expect(orderTotalsConsistent({ ...order("fx-lab-order-2"), totalPaise: 1 })).toBe(false);
  });

  it("http adapter is gated (no documented contract)", async () => {
    const api = createLabHttpApi();
    expect(api.mode).toBe("http");
    expect(await api.listBranches()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.releaseReport({ reportId: "x", expectedVersion: 1, idempotencyKey: "k" })).toEqual({ ok: false, error: { code: "gated" } });
  });
});

describe("lab status map", () => {
  it("unknown values never map to released or completed", () => {
    for (const raw of ["RELEASED", "ready", "constructor", "__proto__", "", null, 7]) {
      expect(describeReport(raw)).toEqual({ labelKey: "lab.status.unknown", tone: "neutral", known: false });
      expect(describeCollection(raw).known).toBe(false);
    }
    expect(describeReport("released").tone).toBe("success");
  });
});
