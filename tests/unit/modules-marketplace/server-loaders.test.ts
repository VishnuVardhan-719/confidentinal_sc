import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { loadDirectory, loadProviderProfile } from "@/modules/providers/server-loaders";
import { createPatientBookingLoaders } from "@/modules/bookings/server-loaders";
import { bookingCard, groupPatientBookings } from "@/modules/bookings/view-model";
import { reviewedFixture, bookingFromReview, testId } from "./phase2-fixtures";

const booking = bookingFromReview(reviewedFixture());
describe("public loaders", () => {
  it("does not call catalog until URL scope is valid", async () => {
    const api = { list: vi.fn(), get: vi.fn() };
    expect((await loadDirectory(api, "doctor", new URLSearchParams(), "en")).kind).toBe("needs_pin");
    expect((await loadDirectory(api, "doctor", new URLSearchParams("patient=secret"), "en")).kind).toBe("invalid");
    expect(api.list).not.toHaveBeenCalled();
    expect(await loadProviderProfile(api, "bad", "doctor", "500001", "en")).toEqual(fail("validation"));
    expect(api.get).not.toHaveBeenCalled();
  });
  it("distinguishes no coverage from transport failure", async () => {
    const list = vi.fn().mockResolvedValue(ok({ items: [], nextCursor: null, synthetic: false }));
    expect((await loadDirectory({ list }, "doctor", new URLSearchParams("pin=500001"), "hi")).kind).toBe("empty");
    list.mockResolvedValue(fail("unavailable"));
    expect((await loadDirectory({ list }, "doctor", new URLSearchParams("pin=500001"), "hi")).kind).toBe("error");
  });
});
describe("private request-scoped loaders", () => {
  it("authorizes every load before any private API access", async () => {
    const authorizePatient = vi.fn().mockResolvedValue(fail("unauthenticated"));
    const api = { list: vi.fn(), get: vi.fn(), timeline: vi.fn() };
    const loaders = createPatientBookingLoaders({ api, authorizePatient });
    expect(await loaders.list("en", "2026-11-19T00:00:00Z")).toEqual(fail("unauthenticated"));
    expect(await loaders.detail(testId, "en")).toEqual(fail("unauthenticated"));
    expect(authorizePatient).toHaveBeenCalledTimes(2);
    expect(api.list).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
  });
  it("keeps timeline/payment gaps explicit without hiding a valid booking", async () => {
    const api = { list: vi.fn(), get: vi.fn().mockResolvedValue(ok(booking)), timeline: vi.fn().mockResolvedValue(fail("gated")) };
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => ok(null) });
    const loaded = await loaders.detail(testId, "te");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.booking.id).toBe(testId);
      expect(loaded.data.timeline).toEqual(fail("gated"));
      expect(loaded.data.payment).toEqual(fail("gated"));
      expect(loaded.data.actions.every(action => !action.enabled)).toBe(true);
    }
  });
  it("validates payment ownership and strips unapproved response fields", async () => {
    const api = { list: vi.fn(), get: vi.fn().mockResolvedValue(ok(booking)), timeline: vi.fn().mockResolvedValue(fail("gated")) };
    const summary = { bookingId: testId, status: "DUE", currency: "INR", amountDuePaise: 50000, collectedPaise: 0, refundedPaise: 0, method: "pay_after", version: 1, synthetic: true, privateNote: "synthetic private field" };
    const getSummary = vi.fn().mockResolvedValue(ok(summary));
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => ok(null), payments: { getSummary } });
    const loaded = await loaders.detail(testId, "en");
    expect(loaded.ok && loaded.data.payment.ok).toBe(true);
    expect(loaded.ok && loaded.data.payment.ok && loaded.data.payment.data).not.toHaveProperty("privateNote");
    getSummary.mockResolvedValue(ok({ ...summary, bookingId: "00000000-0000-4000-8000-000000000002" }));
    const wrong = await loaders.detail(testId, "en");
    expect(wrong.ok && wrong.data.payment).toEqual(fail("unavailable"));
  });
  it("marks a full page incomplete and does not infer a global next visit", async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...booking, id: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0") }));
    const api = { list: vi.fn().mockResolvedValue(ok({ items })), get: vi.fn(), timeline: vi.fn() };
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => ok(null) });
    const loaded = await loaders.list("en", "2026-11-19T00:00:00Z");
    expect(loaded.ok && loaded.data.complete).toBe(false);
    expect(loaded.ok && loaded.data.nextVisit).toBeNull();
    expect(loaded.ok && loaded.data.nextVisitState).toBe("incomplete");
  });
  it("does not fetch auxiliary private data after a denied or mismatched detail", async () => {
    const api = { list: vi.fn(), get: vi.fn().mockResolvedValue(ok({ ...booking, id: "00000000-0000-4000-8000-000000000002" })), timeline: vi.fn() };
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => ok(null) });
    expect(await loaders.detail(testId, "en")).toEqual(fail("unavailable"));
    expect(api.timeline).not.toHaveBeenCalled();
  });
});
describe("patient booking projections", () => {
  it("keeps payment/clinical claims absent and public references nullable", () => {
    const card = bookingCard(booking, "en");
    expect(card.reference).toBeNull();
    expect(card.status).toBe("REQUESTED");
    expect(card).not.toHaveProperty("paid"); expect(card).not.toHaveProperty("clinicalStatus");
  });
  it("groups terminal bookings and sorts upcoming by UTC", () => {
    const cancelled = { ...booking, status: "CANCELLED" as const };
    const groups = groupPatientBookings([cancelled, booking], "2026-11-19T00:00:00Z");
    expect(groups.cancelled).toEqual([cancelled]);
    expect(groups.upcoming).toEqual([booking]);
  });
});
