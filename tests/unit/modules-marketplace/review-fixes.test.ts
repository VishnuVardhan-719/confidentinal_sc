import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/lib/api/http";
import { acceptSchema } from "@/modules/bookings/schemas";
import { detailsStepSchema } from "@/modules/bookings/wizard";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { createPaymentsFixtureApi } from "@/modules/payments/fixture";
import { createProvidersHttpApi } from "@/modules/providers/http";
import { optimisticMarkRead, rollbackMarkRead } from "@/modules/notifications/schemas";
import { syntheticNotification } from "@/fixtures/marketplace/notifications";
import { syntheticProvider } from "@/fixtures/marketplace/providers";

const lower = "abcdef01-0000-4000-8000-000000000001";
const upper = lower.toUpperCase();
const other = "abcdef02-0000-4000-8000-000000000001";
const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };

describe("verified Phase 1 review regressions", () => {
  it("counts resource UUID identity rather than letter casing", () => {
    expect(acceptSchema.safeParse({ expectedVersion: 2, resourceIds: [lower, upper] }).success).toBe(false);
    expect(acceptSchema.safeParse({ expectedVersion: 2, resourceIds: [upper, other] }).success).toBe(true);
  });
  it("counts lab service UUID identity rather than letter casing", () => {
    expect(detailsStepSchema.safeParse({ category: "lab", testServiceIds: [lower, upper], collection: "home" }).success).toBe(false);
    expect(detailsStepSchema.safeParse({ category: "lab", testServiceIds: [upper, other], collection: "home" }).success).toBe(true);
  });
  it("looks up one booking for either UUID spelling in reads and mutations", async () => {
    const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(lower);
    try {
      const api = createBookingsFixtureApi({ env });
      const created = await api.create({ patientId: lower, serviceId: syntheticProvider("doctor").serviceId, addressId: lower, startAt: "2026-11-20T04:30:00Z" }, lower);
      expect(created).toEqual({ ok: true, data: { id: lower } });
      const initial = await api.get(upper);
      expect(initial.ok && initial.data.id).toBe(lower);
      const timeline = await api.timeline(upper);
      expect(timeline.ok && timeline.data.items.map(event => event.status)).toEqual(["REQUESTED"]);
      expect(await api.accept(upper, { expectedVersion: 2, resourceIds: [other] })).toEqual({ ok: true, data: { version: 4 } });
      const updated = await api.get(lower);
      expect(updated.ok && updated.data.status).toBe("CONFIRMED");
    } finally { random.mockRestore(); }
  });
  it("preserves the complete detached caller snapshot for rollback", () => {
    const before = { ...syntheticNotification, isSelected: true, ui: { expanded: true } };
    const change = optimisticMarkRead(before, "2026-11-18T01:00:00Z");
    expect(change.before).toEqual(before);
    before.ui.expanded = false;
    expect(rollbackMarkRead(change.after, change)).toEqual({ ...syntheticNotification, isSelected: true, ui: { expanded: true } });
    const newer = { ...change.after, version: change.after.version + 1 };
    expect(rollbackMarkRead(newer, change)).toBe(newer);
  });
  it("keeps one payment version across uppercase/lowercase booking IDs", async () => {
    const api = createPaymentsFixtureApi({ env });
    const input = { bookingId: lower, amountPaise: 50000, method: "cash" as const, collectedAt: "2026-11-18T00:00:00Z", expectedVersion: 1 };
    expect(await api.recordCollection(input, lower)).toEqual({ ok: true, data: { version: 2 } });
    const summary = await api.getSummary(upper);
    expect(summary.ok && summary.data).toEqual(expect.objectContaining({ bookingId: lower, version: 2 }));
    expect(await api.recordCollection({ ...input, bookingId: upper }, lower)).toEqual({ ok: true, data: { version: 2 } });
    expect(await api.recordCollection({ ...input, bookingId: upper }, other)).toEqual({ ok: false, error: { code: "conflict" } });
  });
  it("keeps the explicit provider ID authoritative over extra scope fields", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ results: [] }));
    const api = createProvidersHttpApi(createHttpClient({ fetch }));
    const scope = { category: "doctor" as const, pin: "500001", id: other };
    await api.get(lower, scope);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/catalog/" + lower + "?category=doctor&pin=500001");
    expect(await api.get("invalid", scope)).toEqual({ ok: false, error: { code: "validation" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
