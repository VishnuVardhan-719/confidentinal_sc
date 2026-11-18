import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { switchWorkspaceAction } from "@/modules/admin/server-actions";
import { labBranchAction, labCatalogAction, labCollectionAction, labRecollectionAction, labReportAction } from "@/modules/lab/server-actions";

const KEY = "0b5c7f0e-6a51-4f71-9d3e-3c5d1b0f2a11";

describe("lab server actions", () => {
  it("reject tampered bound arguments before any authorization or API call", async () => {
    expect(await labCollectionAction({ orderId: "../x", action: "start_collection", expectedVersion: 1, branchId: "b" }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await labCollectionAction({ orderId: "o", action: "release_report" as never, expectedVersion: 1, branchId: "b" }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await labCollectionAction({ orderId: "o", action: "start_collection", expectedVersion: 0, branchId: "b" }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await labCollectionAction({ orderId: "o", action: "record_collection_failed", expectedVersion: 1, branchId: "b" }, { idempotencyKey: KEY, reason: "made_up" })).toEqual({ ok: false, code: "validation", fields: { reason: "required" } });
    expect(await labReportAction({ reportId: "r", expectedVersion: 1, step: "delete" as never }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await labBranchAction({ branchId: "b", active: "yes" as never, expectedVersion: 1 }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await labRecollectionAction({ orderId: "o" }, { idempotencyKey: "short" })).toEqual({ ok: false, code: "validation" });
    expect(await labCatalogAction({ itemId: "i", expectedVersion: 1 }, { price: "1.234", preparation: "", active: true, idempotencyKey: KEY })).toEqual({
      ok: false,
      code: "validation",
      fields: { price: "invalid", preparation: "invalid" },
    });
  });

  it("valid requests without a session are refused as unauthenticated (no demo identity exists)", async () => {
    expect(await labCollectionAction({ orderId: "fx-lab-order-2", action: "start_collection", expectedVersion: 3, branchId: "fx-lab-branch-1" }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await labReportAction({ reportId: "fx-lab-report-2", expectedVersion: 2, step: "release" }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await switchWorkspaceAction("lab", "lab:fx-lab-provider-1")).toEqual({ ok: false, code: "unauthenticated" });
    expect(await switchWorkspaceAction("doctor", "doctor:x")).toEqual({ ok: false, code: "validation" });
  });
});

import { ambulanceAcceptAction, ambulanceDeclineAction, ambulanceTripAction } from "@/modules/ambulance/server-actions";

describe("ambulance server actions", () => {
  it("validate arguments and never accept location or ETA fields", async () => {
    expect(await ambulanceTripAction({ tripId: "t", action: "teleport" as never, expectedVersion: 1 }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation" });
    expect(await ambulanceTripAction({ tripId: "t", action: "interrupt", expectedVersion: 1 }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "validation", fields: { reason: "required" } });
    expect(await ambulanceAcceptAction({ requestId: "r", expectedVersion: 1 }, { vehicleResourceId: "", driverResourceId: "d", idempotencyKey: KEY })).toEqual({ ok: false, code: "validation", fields: { vehicleResourceId: "required" } });
    expect(await ambulanceDeclineAction({ requestId: "r", expectedVersion: 1 }, { idempotencyKey: KEY, reason: "whatever" })).toEqual({ ok: false, code: "validation", fields: { reason: "required" } });
    expect(await ambulanceTripAction({ tripId: "fx-trip-1", action: "en_route", expectedVersion: 2 }, { idempotencyKey: KEY })).toEqual({ ok: false, code: "unauthenticated" });
  });
});
