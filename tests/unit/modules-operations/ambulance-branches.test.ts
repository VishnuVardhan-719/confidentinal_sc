import { describe, expect, expectTypeOf, it } from "vitest";
import type { ApiResult } from "@/lib/api/result";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { ambulanceActors, ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { listWorkspaces } from "@/modules/admin/workspace";
import { getEmergencyGuidance, requestEmergencyDispatch, type EmergencyGuidance } from "@/modules/ambulance/emergency";
import { createAmbulanceFixtureApi } from "@/modules/ambulance/fixture";
import { createAmbulanceHttpApi } from "@/modules/ambulance/http";
import { loadAvailability, loadCrew, loadEmergencyPlaceholder, loadFleet, loadTripDetail, loadTrips } from "@/modules/ambulance/loaders";
import { ambulanceRoutePermits } from "@/modules/ambulance/routes";
import { daysUntil, driverAssignable, quoteConsistent, tripActionDenial, tripBookingState, tripCommandSchema, vehicleAssignable } from "@/modules/ambulance/rules";
import { describeAvailability, describeCredential, describeQuote, describeTrip, describeVehicleType } from "@/modules/ambulance/status";
import type { TripState } from "@/modules/ambulance/types";
import { driverMayAct, expiryWarnings, toDriverTrip, toRequestRow } from "@/modules/ambulance/view-models";

const data = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
};
const code = <T>(r: ApiResult<T>) => (r.ok ? "ok" : r.error.code);
const NOW = new Date("2026-11-20T03:00:00Z");
const ETA = /eta|tracking|latitude|longitude|countdown|minutes/i;

describe("emergency dispatch hard gate and 112", () => {
  const combos: Record<string, string | undefined>[] = [
    {},
    { FEATURE_EMERGENCY_DISPATCH: "true" },
    { FEATURE_EMERGENCY_DISPATCH: "TRUE" },
    { FEATURE_EMERGENCY_DISPATCH: "1" },
    { FEATURE_EMERGENCY_DISPATCH: "true", FEATURE_GPS: "true" },
    Object.fromEntries(FEATURE_FLAGS.map((f) => [`FEATURE_${f.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`, "true"])),
    { APP_ENV: "production", FRONTEND_ADAPTER: "fixture" },
  ];

  it.each(combos)("never offers dispatch and always carries Call 112 (%o)", (env) => {
    const g = getEmergencyGuidance(env);
    expect(g.dispatchAvailable).toBe(false);
    expect(g.callNumber).toBe("112");
    expect(g.messageKey).toBe("ambulance.emergency.call112");
    expect(Object.keys(g).sort()).toEqual(["callNumber", "dispatchAvailable", "messageKey", "reason"]);
    expect(JSON.stringify(g)).not.toMatch(ETA);
  });

  it("only the exact string \"true\" changes the reason, never availability", () => {
    expect(getEmergencyGuidance({ FEATURE_EMERGENCY_DISPATCH: "TRUE" }).reason).toBe("gate_off");
    expect(getEmergencyGuidance({ FEATURE_EMERGENCY_DISPATCH: "true" }).reason).toBe("not_operational");
  });

  it("is type-level unavailable: dispatchAvailable is the literal false", () => {
    expectTypeOf<EmergencyGuidance["dispatchAvailable"]>().toEqualTypeOf<false>();
    expectTypeOf<EmergencyGuidance["callNumber"]>().toEqualTypeOf<"112">();
  });

  it("the dispatch request is always gated, even with every flag on", async () => {
    expect(await requestEmergencyDispatch()).toEqual({ ok: false, error: { code: "gated" } });
  });

  it("the placeholder works without any adapter, even where fixture mode would be refused", () => {
    expect(() => loadEmergencyPlaceholder({ env: { APP_ENV: "production", FRONTEND_ADAPTER: "fixture" } })).not.toThrow();
    expect(loadEmergencyPlaceholder({ env: { APP_ENV: "production", FRONTEND_ADAPTER: "fixture" } }).callNumber).toBe("112");
  });

  it("no module API exposes a dispatch, ETA or tracking method", () => {
    for (const api of [createAmbulanceHttpApi({}), createAmbulanceFixtureApi({ env: {} })]) {
      expect(Object.keys(api).filter((k) => /dispatch|eta|track|location/i.test(k))).toEqual([]);
    }
  });

  it("the emergency route is open to every ambulance role, including billing-only", () => {
    for (const m of [W.ambulanceOperator, W.ambulanceDriver, [{ ...W.ambulanceOperator[0], membershipRole: "billing" as const }]]) {
      expect(ambulanceRoutePermits("emergency", listWorkspaces(m, "ambulance")[0])).toBe(true);
    }
  });

  it("no ambulance status label key mentions an ETA or countdown", () => {
    const states: TripState[] = ["assigned", "en_route", "arrived", "picked_up", "destination_reached", "trip_interrupted", "cancelled", "no_show"];
    for (const s of states) expect(describeTrip(s).labelKey).not.toMatch(/eta|minute|countdown|onTheWay/i);
  });
});

describe("ambulance rules: remaining branches", () => {
  const [veh1, veh2, veh3] = ambulanceFixtures.fleet;
  const [drvA, , drvC] = ambulanceFixtures.crew;

  it("assignability needs verified, unexpired and available resources", () => {
    expect(vehicleAssignable(veh1, NOW)).toBe(true);
    expect(vehicleAssignable({ ...veh1, availability: "unavailable" }, NOW)).toBe(false);
    expect(vehicleAssignable(veh3, NOW)).toBe(false);
    expect(driverAssignable(drvA, NOW)).toBe(true);
    expect(driverAssignable(drvC, NOW)).toBe(false);
    expect(driverAssignable({ ...drvA, membershipStatus: "disabled" }, NOW)).toBe(false);
    expect(driverAssignable({ ...drvA, licenceExpiresAt: null }, NOW)).toBe(false);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil("garbage", NOW)).toBeNull();
    expect(daysUntil(veh2.evidenceExpiresAt, NOW)).toBe(4); // whole days left, rounded down
  });

  it("quote consistency rejects negative and fractional parts", () => {
    const q = ambulanceFixtures.requests[1].quote!;
    expect(quoteConsistent({ ...q, basePaise: -1, totalPaise: q.totalPaise - 90001 })).toBe(false);
    expect(quoteConsistent({ ...q, fees: [{ code: "toll", amountPaise: 0.5 }] })).toBe(false);
  });

  it("trip booking states and denials", () => {
    expect(["assigned", "en_route", "arrived", "picked_up", "trip_interrupted", "cancelled", "no_show"].map((s) => tripBookingState(s as TripState))).toEqual([
      "confirmed", "confirmed", "confirmed", "in_progress", "interrupted", "cancelled", "no_show",
    ]);
    const trip = ambulanceFixtures.trips[0];
    expect(tripActionDenial({ ...ambulanceActors.driverA, membershipStatus: "invited" }, trip, "en_route", undefined, NOW)).toBe("membership_inactive");
    expect(tripActionDenial(ambulanceActors.driverA, trip, "interrupt", undefined, NOW)).toBe("reason_required");
    expect(tripActionDenial(ambulanceActors.driverA, trip, "interrupt", "made_up" as never, NOW)).toBe("reason_required");
    expect(tripActionDenial(ambulanceActors.driverB, trip, "en_route", undefined, NOW)).toBe("not_assigned");
    expect(tripCommandSchema.safeParse({ action: "interrupt", expectedVersion: 2, reason: "vehicle_breakdown" }).success).toBe(true);
    expect(tripCommandSchema.safeParse({ action: "arrived", expectedVersion: 2, reason: "vehicle_breakdown" }).success).toBe(false);
  });
});

describe("ambulance fixture adapter branches", () => {
  it("operator reads; driver denied operator reads", async () => {
    const op = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.operator, now: () => NOW });
    expect(data(await op.listCrew())).toHaveLength(3);
    expect(data(await op.getRequest("fx-amb-req-2")).reference).toBe("#SCV-BKG-900302");
    expect(code(await op.getRequest("nope"))).toBe("not_found");
    expect(data(await op.getTrip("fx-trip-2")).state).toBe("en_route");
    expect(data(await op.listTrips({ queue: "today" })).items.map((t) => t.id)).toEqual(["fx-trip-1", "fx-trip-2"]);
    expect(data(await op.listTrips({ queue: "upcoming" })).items).toEqual([]);
    expect(data(await op.listTrips({ queue: "exceptions" })).items.map((t) => t.id)).toEqual(["fx-trip-4"]);
    expect(code(await op.getDriverQueue())).toBe("forbidden");
    const drv = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverB, now: () => NOW });
    expect(code(await drv.listRequests())).toBe("forbidden");
    expect(code(await drv.getTrip("fx-trip-2"))).toBe("not_found");
  });

  it("driver interrupt needs a reason, records it, and stale versions conflict", async () => {
    const drv = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverB, now: () => NOW });
    const input = { tripId: "fx-trip-2", action: "interrupt" as const, expectedVersion: 3 };
    expect(await drv.performTripAction({ ...input, idempotencyKey: "i0" })).toEqual({ ok: false, error: { code: "validation", fields: { reason: "required" } } });
    expect(code(await drv.performTripAction({ ...input, expectedVersion: 1, reason: "vehicle_breakdown", idempotencyKey: "i1" }))).toBe("conflict");
    const done = data(await drv.performTripAction({ ...input, reason: "vehicle_breakdown", idempotencyKey: "i2" }));
    expect(done.state).toBe("trip_interrupted");
    expect(data(await drv.getDriverQueue())).toEqual({ current: null, laterCount: 0 });
    const inactive = createAmbulanceFixtureApi({ env: {}, actor: { ...ambulanceActors.driverA, membershipStatus: "disabled" } });
    expect(code(await inactive.getDriverQueue())).toBe("forbidden");
  });
});

describe("ambulance view models and loaders", () => {
  it("request rows explain every accept blocker", () => {
    const [stale, fresh] = ambulanceFixtures.requests;
    expect(toRequestRow({ ...fresh, bookingState: "confirmed" }, ambulanceFixtures.fleet, ambulanceFixtures.crew, NOW).acceptBlockers).toEqual(["not_requested"]);
    expect(toRequestRow({ ...fresh, quote: null }, ambulanceFixtures.fleet, ambulanceFixtures.crew, NOW).acceptBlockers).toEqual(["quote_missing"]);
    expect(toRequestRow({ ...fresh, quote: { ...fresh.quote!, totalPaise: 1 } }, ambulanceFixtures.fleet, ambulanceFixtures.crew, NOW).acceptBlockers).toEqual(["quote_inconsistent"]);
    expect(toRequestRow(fresh, null, null, NOW).acceptBlockers).toEqual(["no_vehicle", "no_driver"]);
    expect(toRequestRow(stale, ambulanceFixtures.fleet, ambulanceFixtures.crew, NOW).quote?.status.labelKey).toBe("ambulance.status.quote.stale");
  });

  it("expiry warnings include expired and soon-expiring evidence, soonest first", () => {
    expect(expiryWarnings(ambulanceFixtures.fleet, ambulanceFixtures.crew, new Date("2026-11-20T00:00:00Z")).map((w) => [w.resourceId, w.daysLeft])).toEqual([
      ["fx-res-driver-c", -50],
      ["fx-veh-2", 5],
    ]);
  });

  it("driver VM has no next step on a finished trip; operator never may act", () => {
    const finished = toDriverTrip({ tripId: "t", reference: "r", state: "destination_reached", pickup: { locality: "a", city: "b", pin: null }, destination: { locality: "c", city: "d", pin: null }, window: { start: "x", end: "y" }, requirement: "seated", vehicleLabel: "v", version: 1 });
    expect([finished.nextAction, finished.canInterrupt]).toEqual([null, false]);
    expect(driverMayAct(ambulanceActors.operator, ambulanceFixtures.trips[0], "en_route", NOW)).toBe(false);
    expect(driverMayAct(ambulanceActors.driverA, ambulanceFixtures.trips[0], "en_route", NOW)).toBe(true);
  });

  it("status maps: unverified type, quote, availability and credential unknowns", () => {
    expect(describeVehicleType(null).labelKey).toBe("ambulance.vehicleType.notVerified");
    expect(describeVehicleType("als").known).toBe(false);
    expect(describeQuote(false).labelKey).toBe("ambulance.status.quote.current");
    expect(describeAvailability("busy").known).toBe(false);
    expect(describeCredential("verified").tone).toBe("success");
  });

  it("fleet, crew, availability and trip loaders", async () => {
    const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
    const ctx = { workspace: listWorkspaces(W.ambulanceOperator)[0], env: FX, now: () => NOW };
    const fleet = await loadFleet(ctx);
    expect(fleet.status === "ok" && fleet.data.map((v) => v.assignable)).toEqual([true, true, false]);
    const crew = await loadCrew(ctx);
    expect(crew.status === "ok" && crew.data.map((c) => c.assignable)).toEqual([true, true, false]);
    const avail = await loadAvailability(ctx);
    expect(avail.status === "ok" && [avail.data.vehicles.length, avail.data.crew.length]).toEqual([3, 3]);
    const trips = await loadTrips(ctx, "today");
    expect(trips.status === "ok" && trips.data.rows.map((r) => r.id)).toEqual(["fx-trip-1", "fx-trip-2"]);
    const detail = await loadTripDetail(ctx, "fx-trip-4");
    expect(detail.status === "ok" && detail.data.interruptionKey).toBe("ambulance.interrupt.patient_not_present");
    expect(await loadTripDetail(ctx, "nope")).toEqual({ status: "not_found" });
    expect(await loadFleet({ ...ctx, env: {} })).toEqual({ status: "gated" });
  });
});

describe("ambulance manual accept/decline (fixture)", () => {
  const AT = new Date("2026-11-20T00:00:00Z");
  it("accepts only with a fresh quote and assignable vehicle and driver, then schedules a trip", async () => {
    const op = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.operator, now: () => AT });
    const base = { decision: "accept" as const, vehicleResourceId: "fx-veh-1", driverResourceId: "fx-res-driver-a", expectedVersion: 1 };
    expect(code(await op.decideRequest({ ...base, requestId: "fx-amb-req-1", idempotencyKey: "s" }))).toBe("conflict"); // stale quote
    expect(code(await op.decideRequest({ ...base, requestId: "fx-amb-req-2", vehicleResourceId: "fx-veh-3", idempotencyKey: "v" }))).toBe("validation");
    expect(code(await op.decideRequest({ ...base, requestId: "fx-amb-req-2", driverResourceId: "fx-res-driver-c", idempotencyKey: "d" }))).toBe("validation");
    expect(data(await op.decideRequest({ ...base, requestId: "fx-amb-req-2", idempotencyKey: "ok" })).bookingState).toBe("confirmed");
    expect(data(await op.getTrip("fx-trip-fx-amb-req-2"))).toMatchObject({ state: "assigned", vehicle: { resourceId: "fx-veh-1" }, driver: { resourceId: "fx-res-driver-a" } });
    expect(code(await op.decideRequest({ ...base, requestId: "fx-amb-req-2", idempotencyKey: "again" }))).toBe("conflict");
  });

  it("decline needs a valid reason; drivers cannot decide requests", async () => {
    const op = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.operator, now: () => AT });
    expect(code(await op.decideRequest({ requestId: "fx-amb-req-1", decision: "decline", reason: "made_up" as never, expectedVersion: 1, idempotencyKey: "x" }))).toBe("validation");
    expect(data(await op.decideRequest({ requestId: "fx-amb-req-1", decision: "decline", reason: "provider_unavailable", expectedVersion: 1, idempotencyKey: "y" })).bookingState).toBe("declined");
    const drv = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverA, now: () => AT });
    expect(code(await drv.decideRequest({ requestId: "fx-amb-req-2", decision: "decline", reason: "other", expectedVersion: 1, idempotencyKey: "z" }))).toBe("forbidden");
    expect(code(await createAmbulanceHttpApi({}).decideRequest({ requestId: "r", decision: "decline", reason: "other", expectedVersion: 1, idempotencyKey: "h" }))).toBe("gated");
  });
});
