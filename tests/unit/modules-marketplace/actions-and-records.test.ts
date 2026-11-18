import { describe, expect, it } from "vitest";
import { permittedActions } from "@/modules/bookings/actions";
import { createPaymentsFixtureApi } from "@/modules/payments/fixture";
import { createSupportFixtureApi } from "@/modules/support/fixture";
import { createNotificationsFixtureApi } from "@/modules/notifications/fixture";
import { syntheticNotification } from "@/fixtures/marketplace/notifications";
import { filtersFromSearchParams } from "@/modules/providers/filters";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const id = "00000000-0000-4000-8000-000000000001";
describe("independent operational and financial records", () => {
  it.each(["doctor", "lab", "ambulance", "caretaker"] as const)("can display server-authorized operational completion for %s without clinical activation", category => {
    const action = permittedActions({ category, status: "IN_PROGRESS", serverAllowedActions: ["complete"], clinicalEnabled: false }, category).find(item => item.action === "complete");
    expect(action).toEqual({ action: "complete", enabled: true });
  });
  it("keeps arrival verification/consultation gated without authorization", () => {
    const actions = permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus: "ARRIVED", serverAllowedActions: ["verify_arrival"] }, "doctor");
    expect(actions.find(item => item.action === "verify_arrival")).toEqual({ action: "verify_arrival", enabled: false, disabledReasonKey: "booking.action.clinicalGated" });
  });
  it("does not mark provider collection claims as gateway paid and deduplicates claims", async () => {
    const api = createPaymentsFixtureApi({ env });
    const input = { bookingId: id, amountPaise: 50000, method: "cash" as const, collectedAt: "2026-11-18T00:00:00Z", expectedVersion: 1 };
    const result = await api.recordCollection(input, id);
    expect(result).toEqual({ ok: true, data: { version: 2 } });
    expect(await api.recordCollection(input, id)).toEqual(result);
    expect(await api.recordCollection({ ...input, amountPaise: 1000 }, id)).toEqual({ ok: false, error: { code: "conflict" } });
    const summary = await api.getSummary(id);
    expect(summary.ok && summary.data).toEqual(expect.objectContaining({ status: "DUE", amountDuePaise: 50000, collectedPaise: 0, synthetic: true }));
  });
  it("deduplicates support requests and returns isolated minimal snapshots", async () => {
    const api = createSupportFixtureApi({ env });
    const input = { category: "service" as const, description: "Synthetic scheduling assistance" };
    const first = await api.create(input, id);
    expect(await api.create(input, id)).toEqual(first);
    expect(await api.create({ ...input, category: "payment" }, id)).toEqual({ ok: false, error: { code: "conflict" } });
    if (!first.ok) throw new Error("Expected synthetic ticket");
    first.data.status = "CLOSED";
    const current = await api.get(first.data.id);
    expect(current.ok && current.data.status).toBe("OPEN");
    expect(JSON.stringify(current)).not.toContain(input.description);
  });
  it("marks notifications read with version checks and isolated snapshots", async () => {
    const api = createNotificationsFixtureApi({ env });
    const read = await api.markRead(syntheticNotification.id, { expectedVersion: 1 });
    expect(read.ok && read.data).toEqual(expect.objectContaining({ version: 2, synthetic: true }));
    expect(await api.markRead(syntheticNotification.id, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "conflict" } });
    if (!read.ok) throw new Error("Expected synthetic notification");
    const readAt = read.data.readAt;
    expect(readAt).not.toBeNull();
    read.data.readAt = null;
    const list = await api.list();
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("Expected notification readback");
    expect(list.data.items.find(item => item.id === syntheticNotification.id)?.readAt).toBe(readAt);
  });
  it("rejects malformed cursor components before transport", () => {
    for (const cursor of ["1,---,---", "10000000001," + id + "," + id, "1,not-id," + id]) {
      const params = new URLSearchParams({ category: "doctor", pin: "500001", cursor });
      expect(filtersFromSearchParams(params)).toEqual({ ok: false, error: { code: "validation" } });
    }
  });
});
