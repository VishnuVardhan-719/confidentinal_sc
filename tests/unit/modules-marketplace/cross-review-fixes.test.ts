import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFixtureMode } from "@/lib/api/fixture";
import { createHttpClient } from "@/lib/api/http";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { createBookingsApi } from "@/modules/bookings/api";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { createBookingsHttpApi } from "@/modules/bookings/http";
import { permittedActions } from "@/modules/bookings/actions";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import { bookingMatchesReview, createBookingSubmitter } from "@/modules/bookings/submit";
import type { CreateBooking } from "@/modules/bookings/schemas";
import { paymentPolicyStepSchema, type BookingReview } from "@/modules/bookings/wizard";
import { createProvidersFixtureApi } from "@/modules/providers/fixture";
import { bookingFromReview, reviewedFixture, testId } from "./phase2-fixtures";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const fixtureId = "00000000-0000-4000-8000-000000000061";
const policy = { id: "00000000-0000-4000-8000-000000000051", published: true, cancelWindowMinutes: 60 };
const cutoff = Date.parse("2026-11-20T03:30:00.000Z");
const cancellation = { expectedVersion: 2, reason: "patient_request" as const };
const prepare = async (review: BookingReview): Promise<ApiResult<CreateBooking>> => ok({ patientId: review.patient.patientId,
  serviceId: review.service.serviceId, addressId: review.location.addressId, startAt: review.schedule.startAt });

afterEach(() => vi.unstubAllGlobals());

describe("cross-review C1: policy-less B01 rows remain readable", () => {
  const review = reviewedFixture();
  const booking = bookingFromReview(review);
  const wire = { id: booking.id, public_ref: null, provider_id: booking.providerId, service_id: booking.serviceId,
    category: booking.category, pin_code: booking.pin, start_at: booking.startAt, end_at: booking.endAt,
    state: "requested", version: 2, amount_paise: "50000", currency: "INR", terms_version: "synthetic-not-approved",
    policy_version_id: null, substate: null };

  it("reads detail and mixed-policy lists without hiding all bookings", async () => {
    const http = createHttpClient({ fetch: async path => Response.json(String(path).includes("?")
      ? { items: [wire, { ...wire, id: fixtureId, policy_version_id: testId }] } : { booking: wire }) });
    const api = createBookingsHttpApi(http);
    const detail = await api.get(testId);
    expect(detail.ok && detail.data.priceSnapshot.policyVersionId).toBeNull();
    const list = await api.list();
    expect(list.ok && list.data.items.map(item => item.priceSnapshot.policyVersionId)).toEqual([null, testId]);
  });

  it("requires policy review after create rather than entering permanent uncertainty", async () => {
    const missing = { ...booking, priceSnapshot: { ...booking.priceSnapshot, policyVersionId: null } };
    const api = createBookingsHttpApi(createHttpClient({ fetch: async (_path, init) =>
      init?.method === "POST" ? Response.json({ id: testId }) : Response.json({ booking: wire }) }));
    const create = vi.spyOn(api, "create");
    const controller = createBookingSubmitter({ api, prepare });
    expect(await controller.submit(review)).toEqual({ phase: "review_required", booking: { ...missing, synthetic: false } });
    await controller.reconcile();
    expect(create).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().phase).toBe("review_required");
    expect(controller.reset()).toEqual(fail("conflict"));
  });

  it("still forbids reviewing a missing policy as approved", () => {
    expect(paymentPolicyStepSchema.safeParse({ ...review.paymentPolicy,
      priceSnapshot: { ...review.paymentPolicy.priceSnapshot, policyVersionId: null } }).success).toBe(false);
    // Booking reads admit null, while an approved policy is always required for a new intent.
    const missing = { ...booking, priceSnapshot: { ...booking.priceSnapshot, policyVersionId: null } };
    expect(bookingMatchesReview(missing, review)).toBe(false);
  });
});

describe("cross-review C2: fixtures are server-owned", () => {
  it("rejects explicitly injected production environments", () => {
    expect(() => assertFixtureMode({ FRONTEND_ADAPTER: "fixture", APP_ENV: "production" })).toThrow();
  });
  it("refuses direct and factory fixture construction in a browser", () => {
    vi.stubGlobal("window", {});
    expect(() => createBookingsFixtureApi({ env })).toThrow(/server/i);
    expect(() => createBookingsApi(env)).toThrow(/server/i);
    expect(() => createProvidersFixtureApi({ env })).toThrow(/server/i);
  });
  it("rechecks browser refusal at operation time", async () => {
    const api = createBookingsFixtureApi({ env });
    vi.stubGlobal("window", {});
    await expect(api.list()).rejects.toThrow(/server/i);
  });
});

describe("cross-review C3: B01 operational phases", () => {
  it.each(["SCHEDULED", "EN_ROUTE", "ARRIVED", "SERVICE_STARTED", "SERVICE_COMPLETED"])("labels %s distinctly", phase => {
    expect(bookingStatusPresentation(phase).labelKey).not.toBe("booking.status.unknown");
  });
  it.each([
    ["SCHEDULED", "en_route"], ["EN_ROUTE", "arrive"], ["ARRIVED", "verify_arrival"],
  ] as const)("uses %s for the %s action", (doctorOperationalStatus, action) => {
    const actions = permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus,
      serverAllowedActions: [action], clinicalEnabled: true }, "doctor");
    expect(actions.find(item => item.action === action)).toEqual({ action, enabled: true });
  });
  it("requires a scheduled phase and server grant before setting off", () => {
    for (const doctorOperationalStatus of [undefined, null, "ARRIVED", "SERVICE_COMPLETED"] as const) {
      expect(permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus,
        serverAllowedActions: ["en_route"] }, "doctor").find(item => item.action === "en_route")?.enabled).toBe(false);
    }
    expect(permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus: "SCHEDULED" }, "doctor")
      .find(item => item.action === "en_route")?.disabledReasonKey).toBe("booking.action.authorizationRequired");
  });
  it("does not infer clinical verification from any operational phase", () => {
    for (const doctorOperationalStatus of ["ARRIVED", "SERVICE_STARTED", "SERVICE_COMPLETED"] as const) {
      expect(permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus,
        clinicalEnabled: true, serverAllowedActions: ["start_consultation"] }, "doctor")
        .find(item => item.action === "start_consultation")?.enabled).toBe(false);
    }
    expect(permittedActions({ category: "doctor", status: "CONFIRMED", doctorOperationalStatus: "ARRIVED",
      arrivalVerified: true, clinicalEnabled: true, serverAllowedActions: ["start_consultation"] }, "doctor")
      .find(item => item.action === "start_consultation")?.enabled).toBe(true);
  });
});

describe("cross-review C4: fixture cancellation policy", () => {
  it.each(["accepted", "cancel_window"] as const)("denies %s cancellation without changing its version or timeline", async scenario => {
    const api = createBookingsFixtureApi({ env, scenario, cancellationPolicy: policy, now: () => new Date(cutoff + 1) });
    const before = await api.get(fixtureId);
    const timeline = await api.timeline(fixtureId);
    expect(await api.cancel(fixtureId, cancellation)).toEqual(fail("conflict"));
    expect(await api.get(fixtureId)).toEqual(before);
    expect(await api.timeline(fixtureId)).toEqual(timeline);
  });
  it.each([undefined, { ...policy, published: false }, { ...policy, id: testId }])("denies missing/unpublished/mismatched policy %#", async cancellationPolicy => {
    const api = createBookingsFixtureApi({ env, scenario: "accepted", cancellationPolicy, now: () => new Date(cutoff - 1) });
    expect(await api.cancel(fixtureId, cancellation)).toEqual(fail("conflict"));
  });
  it.each([-1, 0])("permits cancellation at cutoff offset %s ms, matching B01's strict comparison", async offset => {
    const api = createBookingsFixtureApi({ env, scenario: "accepted", cancellationPolicy: policy, now: () => new Date(cutoff + offset) });
    expect(await api.cancel(fixtureId, cancellation)).toEqual(ok({ version: 3 }));
  });
  it("does not require an accepted-booking policy to cancel a request", async () => {
    const api = createBookingsFixtureApi({ env, scenario: "requested", now: () => new Date(cutoff + 1) });
    expect(await api.cancel(fixtureId, cancellation)).toEqual(ok({ version: 3 }));
  });
});

describe("cross-review C5: cancellation actor attribution", () => {
  it.each(["patient", "provider"] as const)("attributes a %s cancellation correctly", async actorRole => {
    const api = createBookingsFixtureApi({ env, scenario: "requested", actorRole });
    expect(await api.cancel(fixtureId, cancellation)).toEqual(ok({ version: 3 }));
    const timeline = await api.timeline(fixtureId);
    expect(timeline.ok && timeline.data.items).toEqual([expect.objectContaining({ status: "CANCELLED", actorRole, version: 3 })]);
  });
});
