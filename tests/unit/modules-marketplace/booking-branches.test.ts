import { describe, expect, it, vi } from "vitest";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { createHttpClient } from "@/lib/api/http";
import { createBookingsApi } from "@/modules/bookings/api";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { createBookingsHttpApi } from "@/modules/bookings/http";
import { createBookingSubmitter } from "@/modules/bookings/submit";
import { bookingMatchesReview } from "@/modules/bookings/review-matching";
import { createWizardState, wizardReducer, WIZARD_STEPS, type WizardState } from "@/modules/bookings/wizard-state";
import { kolkataScheduleToUtc } from "@/modules/bookings/schedule";
import type { Booking, CreateBooking } from "@/modules/bookings/schemas";
import type { BookingReview } from "@/modules/bookings/wizard";
import { reviewedFixture, bookingFromReview, testId } from "./phase2-fixtures";

const env = { APP_ENV: "test", FRONTEND_ADAPTER: "fixture" };
const other = "00000000-0000-4000-8000-000000000009";
const prepare = async (review: BookingReview): Promise<ApiResult<CreateBooking>> => ok({ patientId: review.patient.patientId, serviceId: review.service.serviceId, addressId: review.location.addressId, startAt: review.schedule.startAt });
function ready(): WizardState {
  let state = createWizardState(); const review = reviewedFixture();
  for (const step of WIZARD_STEPS) {
    if (step === "result") break;
    state = wizardReducer(state, { type: "save", step, value: step === "review" ? review : review[step] });
    if (step !== "review") state = wizardReducer(state, { type: "next" });
  }
  return state;
}

describe("wizard rejection and scheduling branches", () => {
  it("refuses out-of-order saves and keeps back at the first step", () => {
    const state = createWizardState();
    expect(wizardReducer(state, { type: "save", step: "location", value: reviewedFixture().location }).values).toEqual({});
    expect(wizardReducer(state, { type: "back" }).step).toBe("service");
    expect(wizardReducer(state, { type: "submit_started" }).phase).toBe("editing");
    expect(wizardReducer(state, { type: "submit_rejected", revision: 0, code: "conflict" })).toBe(state);
  });
  it("requires fresh price/policy review after conflict without erasing earlier choices", () => {
    const state = wizardReducer(ready(), { type: "submit_started" });
    const rejected = wizardReducer(state, { type: "submit_rejected", revision: state.revision, code: "conflict" });
    expect(rejected.phase).toBe("editing"); expect(rejected.step).toBe("paymentPolicy");
    expect(rejected.values.paymentPolicy).toBeUndefined(); expect(rejected.values.review).toBeUndefined();
    expect(rejected.values.schedule).toEqual(state.values.schedule);
    const forbidden = wizardReducer(state, { type: "submit_rejected", revision: state.revision, code: "forbidden" });
    expect(forbidden.phase).toBe("editing"); expect(forbidden.issues).toEqual([{ path: "review", code: "forbidden" }]);
  });
  it("ignores wrong-provider receipts and prevents edits after a result", () => {
    const state = wizardReducer(ready(), { type: "submit_started" });
    const wrong = { ...bookingFromReview(reviewedFixture()), providerId: other };
    expect(wizardReducer(state, { type: "submit_resolved", revision: state.revision, booking: wrong })).toBe(state);
    const result = wizardReducer(state, { type: "submit_resolved", revision: state.revision, booking: bookingFromReview(reviewedFixture()) });
    expect(wizardReducer(result, { type: "back" })).toBe(result);
    expect(wizardReducer(result, { type: "submit_started" })).toBe(result);
  });
  it.each([
    { date: "2026-11-20", time: "24:00", durationMinutes: 60 },
    { date: "2026-11-20", time: "10:60", durationMinutes: 60 },
    { date: "2026-11-20", time: "10:00", durationMinutes: 0 },
    { date: "2026-11-20", time: "10:00", durationMinutes: 10081 },
  ])("rejects invalid local schedule: %j", input => {
    expect(kolkataScheduleToUtc(input, "2026-11-18T00:00:00Z")).toEqual(fail("validation"));
  });
  it("rejects invalid current time and an already-starting slot; handles UTC date rollover", () => {
    const input = { date: "2026-11-20", time: "00:15", durationMinutes: 60 };
    expect(kolkataScheduleToUtc(input, "bad")).toEqual(fail("validation"));
    expect(kolkataScheduleToUtc(input, "2026-11-19T18:45:00Z")).toEqual(fail("validation"));
    expect(kolkataScheduleToUtc(input, "2026-11-18T00:00:00Z")).toEqual(ok({ startAt: "2026-11-19T18:45:00.000Z", endAt: "2026-11-19T19:45:00.000Z" }));
  });
});

describe("review snapshot comparisons", () => {
  const changes: [string, (booking: Booking) => void][] = [
    ["provider", booking => { booking.providerId = other; }], ["service", booking => { booking.serviceId = other; }],
    ["category", booking => { booking.category = "lab"; }], ["coverage", booking => { booking.pin = "500002"; }],
    ["start", booking => { booking.startAt = "2026-11-21T04:30:00.000Z"; }], ["end", booking => { booking.endAt = "2026-11-21T05:30:00.000Z"; }],
    ["price", booking => { booking.priceSnapshot.amountPaise++; }], ["terms", booking => { booking.priceSnapshot.termsVersion = "changed"; }],
    ["policy", booking => { booking.priceSnapshot.policyVersionId = other; }],
  ];
  it.each(changes)("requires reapproval after a changed %s", (_name, change) => {
    const review = reviewedFixture(); const booking = bookingFromReview(review); change(booking);
    expect(bookingMatchesReview(booking, review)).toBe(false);
  });
});

describe("submission preparation, transport and lifecycle branches", () => {
  it("rejects invalid review and mismatched prepared identities before POST", async () => {
    const api = { create: vi.fn(), get: vi.fn() };
    const controller = createBookingSubmitter({ api, prepare });
    expect(await controller.submit({})).toEqual({ phase: "failed", error: { code: "validation" } });
    expect(controller.reset()).toEqual(ok(null));
    for (const field of ["patientId", "serviceId", "addressId", "startAt"] as const) {
      const wrong = createBookingSubmitter({ api, prepare: async review => {
        const result = await prepare(review); if (!result.ok) return result;
        return ok({ ...result.data, [field]: field === "startAt" ? "2026-11-21T04:30:00.000Z" : other });
      } });
      expect(await wrong.submit(reviewedFixture())).toEqual({ phase: "failed", error: { code: "conflict" } });
    }
    expect(api.create).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
  });
  it("treats preparation exceptions as safe failures because no POST was issued", async () => {
    const api = { create: vi.fn(), get: vi.fn() };
    const controller = createBookingSubmitter({ api, prepare: async () => { throw new Error("private detail"); } });
    expect(await controller.submit(reviewedFixture())).toEqual({ phase: "failed", error: { code: "unavailable" } });
    expect(controller.reset()).toEqual(ok(null)); expect(api.create).not.toHaveBeenCalled();
  });
  it("treats a thrown POST as uncertain and malformed success IDs cannot unlock it", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("private detail")).mockResolvedValueOnce(ok({ id: "invalid" }));
    const api = { create, get: vi.fn() }; const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(reviewedFixture());
    expect(controller.getSnapshot()).toEqual({ phase: "uncertain", error: { code: "unavailable" } });
    await controller.reconcile(); expect(controller.getSnapshot().phase).toBe("uncertain");
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(controller.reset()).toEqual(fail("conflict")); expect(api.get).not.toHaveBeenCalled();
  });
  it("keeps a known-ID read exception uncertain and reconciliation does not POST again", async () => {
    const review = reviewedFixture();
    const api = { create: vi.fn(async () => ok({ id: testId })), get: vi.fn().mockRejectedValueOnce(new Error("private")).mockResolvedValueOnce(ok(bookingFromReview(review))) };
    const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(review);
    expect(controller.getSnapshot()).toEqual({ phase: "uncertain", knownBookingId: testId, error: { code: "unavailable" } });
    await controller.reconcile(); expect(controller.getSnapshot().phase).toBe("resolved");
    expect(api.create).toHaveBeenCalledTimes(1);
    const snapshot = controller.getSnapshot();
    await controller.reconcile(); await controller.submit(review);
    expect(controller.getSnapshot()).toBe(snapshot); expect(api.get).toHaveBeenCalledTimes(2);
    expect(snapshot.phase === "resolved" && Object.isFrozen(snapshot.booking.priceSnapshot)).toBe(true);
  });
  it.each(["preparation", "readback"] as const)("disposes during %s without issuing/retaining private work", async phase => {
    const prepared = Promise.withResolvers<ApiResult<CreateBooking>>();
    const readback = Promise.withResolvers<ApiResult<Booking>>();
    const api = { create: vi.fn(async () => ok({ id: testId })), get: vi.fn(() => readback.promise) };
    const controller = createBookingSubmitter({ api, prepare: phase === "preparation" ? () => prepared.promise : prepare });
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    const operation = controller.submit(reviewedFixture());
    if (phase === "readback") await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(controller.reset()).toEqual(fail("conflict"));
    controller.dispose(); const calls = listener.mock.calls.length;
    prepared.resolve(await prepare(reviewedFixture())); readback.resolve(ok(bookingFromReview(reviewedFixture()))); await operation;
    expect(await controller.submit(reviewedFixture())).toEqual({ phase: "disposed" });
    expect(await controller.reconcile()).toEqual({ phase: "disposed" });
    expect(controller.reset()).toEqual(fail("conflict"));
    expect(listener).toHaveBeenCalledTimes(calls); unsubscribe();
    expect(api.create).toHaveBeenCalledTimes(phase === "preparation" ? 0 : 1);
  });
  it("can reconcile a changed offer by GET only and unsubscribe listeners", async () => {
    const review = reviewedFixture(); const changed = bookingFromReview(review); changed.priceSnapshot.termsVersion = "changed";
    const api = { create: vi.fn(async () => ok({ id: testId })), get: vi.fn().mockResolvedValueOnce(ok(changed)).mockResolvedValueOnce(ok(bookingFromReview(review))) };
    const controller = createBookingSubmitter({ api, prepare });
    expect(await controller.reconcile()).toEqual({ phase: "idle" });
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener); unsubscribe();
    await controller.submit(review); expect(controller.getSnapshot().phase).toBe("review_required");
    await controller.reconcile(); expect(controller.getSnapshot().phase).toBe("resolved");
    expect(listener).not.toHaveBeenCalled(); expect(api.create).toHaveBeenCalledTimes(1);
  });
});

describe("booking adapter rejection branches", () => {
  it("rejects invalid IDs, bodies and pagination before network", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(); const api = createBookingsHttpApi(createHttpClient({ fetch }));
    const review = reviewedFixture(); const body = await prepare(review); if (!body.ok) throw new Error("Expected valid synthetic input");
    expect(await api.create(body.data, "bad")).toEqual(fail("validation"));
    expect(await api.create({ ...body.data, patientId: "bad" }, testId)).toEqual(fail("validation"));
    expect(await api.list({ limit: 0 })).toEqual(fail("validation"));
    expect(await api.get("bad")).toEqual(fail("validation"));
    expect(await api.accept(testId, { expectedVersion: 1, resourceIds: [] })).toEqual(fail("validation"));
    expect(await api.decline("bad", { expectedVersion: 1, reason: "provider_unavailable" })).toEqual(fail("validation"));
    expect(await api.cancel(testId, { expectedVersion: 0, reason: "patient_request" })).toEqual(fail("validation"));
    expect(await api.timeline("bad")).toEqual(fail("validation")); expect(fetch).not.toHaveBeenCalled();
  });
  it("serializes list cursors and separates decline/cancel versioned mutations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => init?.method === "POST" ? Response.json({ version: 3 }) : Response.json({ items: [] }));
    const api = createBookingsHttpApi(createHttpClient({ fetch }));
    expect(await api.list({ providerId: testId, cursor: other, limit: 5 })).toEqual(ok({ items: [] }));
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/bookings?providerId=" + testId + "&limit=5&cursor=" + other);
    for (const action of ["decline", "cancel"] as const) expect(await api[action](testId, { expectedVersion: 2, reason: "provider_unavailable" })).toEqual(ok({ version: 3 }));
    expect(fetch.mock.calls.slice(1).map(call => call[0])).toEqual(["/api/bookings/" + testId + "/decline", "/api/bookings/" + testId + "/cancel"]);
  });
  it("covers empty/stale-slot fixture factories and denies invalid or missing records", async () => {
    const review = reviewedFixture(); const body = await prepare(review); if (!body.ok) throw new Error("Expected input");
    expect(await createBookingsFixtureApi({ env, scenario: "stale_slot" }).create(body.data, testId)).toEqual(fail("conflict"));
    const api = createBookingsApi(env);
    expect(await api.get(testId)).toEqual(fail("not_found"));
    expect(await api.timeline(testId)).toEqual(fail("not_found"));
    expect(await api.cancel(testId, { expectedVersion: 2, reason: "patient_request" })).toEqual(fail("not_found"));
    expect(await api.list({ limit: 0 })).toEqual(fail("validation"));
    expect(await api.create({ ...body.data, serviceId: other }, testId)).toEqual(fail("not_found"));
    expect(await createBookingsApi({ APP_ENV: "test" }).get("bad")).toEqual(fail("validation"));
  });
  it("rejects incorrect resource count/reason and cancellation of a terminal booking", async () => {
    const api = createBookingsFixtureApi({ env }); const input = await prepare(reviewedFixture()); if (!input.ok) throw new Error("Expected input");
    const result = await api.create(input.data, testId); if (!result.ok) throw new Error("Expected booking");
    expect(await api.accept(result.data.id, { expectedVersion: 2, resourceIds: [testId, other] })).toEqual(fail("validation"));
    expect(await api.decline(result.data.id, { expectedVersion: 2, reason: "patient_request" })).toEqual(fail("validation"));
    expect(await api.cancel(result.data.id, { expectedVersion: 2, reason: "patient_request" })).toEqual(ok({ version: 3 }));
    expect(await api.cancel(result.data.id, { expectedVersion: 3, reason: "patient_request" })).toEqual(fail("conflict"));
    const events = await api.timeline(result.data.id);
    expect(events.ok && events.data.items.map(item => item.status)).toEqual(["REQUESTED", "CANCELLED"]);
  });
});
