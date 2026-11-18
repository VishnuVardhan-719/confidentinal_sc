import { describe, expect, it, vi } from "vitest";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { createBookingSubmitter } from "@/modules/bookings/submit";
import type { Booking, CreateBooking } from "@/modules/bookings/schemas";
import type { BookingReview } from "@/modules/bookings/wizard";
import { reviewedFixture, bookingFromReview, testId } from "./phase2-fixtures";
const prepare = async (review: BookingReview): Promise<ApiResult<CreateBooking>> => ok({ patientId: review.patient.patientId, serviceId: review.service.serviceId,
  addressId: review.location.addressId, startAt: review.schedule.startAt });

describe("idempotent booking submission", () => {
  it("deduplicates double clicks and resolves only a refetched server booking", async () => {
    const pending = Promise.withResolvers<ApiResult<{ id: string }>>();
    const review = reviewedFixture();
    const api = { create: vi.fn(() => pending.promise), get: vi.fn(async () => ok(bookingFromReview(review))) };
    const controller = createBookingSubmitter({ api, prepare });
    const first = controller.submit(review); const duplicate = controller.submit(review);
    expect(duplicate).toBe(first);
    await Promise.resolve(); expect(controller.getSnapshot().phase).toBe("submitting");
    expect(api.create).toHaveBeenCalledTimes(1); expect(api.get).not.toHaveBeenCalled();
    pending.resolve(ok({ id: testId })); await first;
    const state = controller.getSnapshot(); expect(state.phase).toBe("resolved");
    expect(state.phase === "resolved" && state.booking.publicReference).toBe(null);
  });
  it("reconciles an unknown create outcome using exactly the same key and body", async () => {
    const review = reviewedFixture();
    const create = vi.fn<(input: CreateBooking, key: string) => Promise<ApiResult<{ id: string }>>>()
      .mockResolvedValueOnce(fail("unavailable")).mockResolvedValueOnce(ok({ id: testId }));
    const api = { create, get: vi.fn(async () => ok(bookingFromReview(review))) };
    const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(review); expect(controller.getSnapshot().phase).toBe("uncertain");
    expect(controller.reset()).toEqual({ ok: false, error: { code: "conflict" } });
    const changed = structuredClone(review); changed.schedule.startAt = "2026-11-21T04:30:00.000Z"; changed.schedule.endAt = "2026-11-21T05:30:00.000Z";
    await controller.submit(changed); expect(create).toHaveBeenCalledTimes(1);
    await controller.reconcile(); expect(controller.getSnapshot().phase).toBe("resolved");
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });
  it("does not treat a denial after an unknown outcome as proof the first POST failed", async () => {
    const create = vi.fn<(input: CreateBooking, key: string) => Promise<ApiResult<{ id: string }>>>()
      .mockResolvedValueOnce(fail("unavailable")).mockResolvedValueOnce(fail("forbidden"));
    const controller = createBookingSubmitter({ api: { create, get: async () => fail("not_found") }, prepare });
    await controller.submit(reviewedFixture()); await controller.reconcile();
    expect(controller.getSnapshot().phase).toBe("uncertain");
    expect(controller.reset().ok).toBe(false);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });
  it("returns a stable immutable snapshot between state changes", () => {
    const controller = createBookingSubmitter({ api: { create: async () => fail("gated"), get: async () => fail("gated") } });
    const snapshot = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
  it("refetches only a known ID after a detail read timeout", async () => {
    const review = reviewedFixture();
    const api = { create: vi.fn(async () => ok({ id: testId })),
      get: vi.fn<(id: string) => Promise<ApiResult<Booking>>>().mockResolvedValueOnce(fail("unavailable")).mockResolvedValueOnce(ok(bookingFromReview(review))) };
    const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(review); expect(controller.getSnapshot().phase).toBe("uncertain");
    await controller.reconcile(); expect(controller.getSnapshot().phase).toBe("resolved");
    expect(api.create).toHaveBeenCalledTimes(1); expect(api.get).toHaveBeenCalledTimes(2);
  });
  it("keeps a created booking with changed price in review_required and prevents a duplicate intent", async () => {
    const review = reviewedFixture(); const changed = bookingFromReview(review); changed.priceSnapshot.amountPaise++;
    const api = { create: vi.fn(async () => ok({ id: testId })), get: vi.fn(async () => ok(changed)) };
    const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(review); expect(controller.getSnapshot().phase).toBe("review_required");
    expect(controller.reset().ok).toBe(false);
    await controller.submit(review); expect(api.create).toHaveBeenCalledTimes(1);
  });
  it("does not pretend a response for a different booking ID resolves this intent", async () => {
    const review = reviewedFixture(); const wrong = bookingFromReview(review); wrong.id = "00000000-0000-4000-8000-000000000002";
    const controller = createBookingSubmitter({ api: { create: async () => ok({ id: testId }), get: async () => ok(wrong) }, prepare });
    await controller.submit(review); expect(controller.getSnapshot().phase).toBe("uncertain");
  });
  it("gates HTTP review submission until an approved review acknowledgment contract is supplied", async () => {
    const api = { create: vi.fn(async () => ok({ id: testId })), get: vi.fn(async () => ok(bookingFromReview(reviewedFixture()))) };
    const controller = createBookingSubmitter({ api });
    await controller.submit(reviewedFixture()); expect(controller.getSnapshot()).toEqual({ phase: "failed", error: { code: "gated" } });
    expect(api.create).not.toHaveBeenCalled();
  });
  it("does not retry 409 and permits a new intent only after explicit reset", async () => {
    const api = { create: vi.fn(async () => fail("conflict")), get: vi.fn(async () => fail("not_found")) };
    const controller = createBookingSubmitter({ api, prepare });
    await controller.submit(reviewedFixture()); expect(controller.getSnapshot().phase).toBe("failed");
    expect(api.create).toHaveBeenCalledTimes(1); expect(api.get).not.toHaveBeenCalled();
    expect(controller.reset()).toEqual(ok(null));
  });
  it("clears private state and ignores completions on logout/workspace disposal", async () => {
    const pending = Promise.withResolvers<ApiResult<{ id: string }>>();
    const api = { create: vi.fn(() => pending.promise), get: vi.fn(async () => ok(bookingFromReview(reviewedFixture()))) };
    const controller = createBookingSubmitter({ api, prepare });
    const running = controller.submit(reviewedFixture()); await Promise.resolve(); controller.dispose();
    pending.resolve(ok({ id: testId })); await running;
    expect(controller.getSnapshot()).toEqual({ phase: "disposed" }); expect(api.get).not.toHaveBeenCalled();
  });
});
