import { describe, expect, it } from "vitest";
import { ambulanceActors, ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { getEmergencyGuidance, requestEmergencyDispatch } from "@/modules/ambulance/emergency";
import { createAmbulanceFixtureApi } from "@/modules/ambulance/fixture";
import { createAmbulanceHttpApi } from "@/modules/ambulance/http";
import {
  displayVehicleType,
  isQuoteStale,
  nextTripState,
  quoteConsistent,
  selectDriverQueue,
  tripActionDenial,
  tripBookingState,
  tripCommandSchema,
} from "@/modules/ambulance/rules";
import { describeTrip } from "@/modules/ambulance/status";

const FORBIDDEN_KEYS = /eta|tracking|latitude|longitude|\blat\b|\blng\b|location|countdown|minutes/i;

function allKeys(value: unknown, acc: string[] = []): string[] {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.push(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

/** One hour before fx-trip-1's window (2026-11-20T04:00Z): inside the driver view lead time. */
const IN_WINDOW = new Date("2026-11-20T03:00:00Z");

describe("driver sees only assigned trip", () => {
  it("rule returns only the driver's own current trip as a minimal projection", () => {
    const queue = selectDriverQueue(ambulanceFixtures.trips, ambulanceActors.driverA, IN_WINDOW);
    expect(queue.current?.tripId).toBe("fx-trip-1"); // fx-trip-3 is completed, others are driver B's
    expect(queue.laterCount).toBe(0);
    expect(Object.keys(queue.current!).sort()).toEqual(["destination", "pickup", "reference", "requirement", "state", "tripId", "vehicleLabel", "version", "window"]);
    expect(selectDriverQueue(ambulanceFixtures.trips, ambulanceActors.operator, IN_WINDOW)).toEqual({ current: null, laterCount: 0 });
  });

  it("fixture: another driver's trip is not_found and cannot be progressed", async () => {
    const api = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverA, now: () => IN_WINDOW });
    const queue = await api.getDriverQueue();
    expect(queue.ok && queue.data.current?.tripId).toBe("fx-trip-1");
    expect(await api.getDriverTrip("fx-trip-2")).toEqual({ ok: false, error: { code: "not_found" } });
    const step = await api.performTripAction({ tripId: "fx-trip-2", action: "arrived", expectedVersion: 3, idempotencyKey: "a1" });
    expect(step).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await api.listFleet()).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("operator manager cannot record driver milestones", () => {
    const trip = ambulanceFixtures.trips[0];
    expect(tripActionDenial(ambulanceActors.operator, trip, "en_route", undefined, IN_WINDOW)).toBe("not_assigned");
    expect(tripActionDenial(ambulanceActors.driverA, trip, "en_route", undefined, IN_WINDOW)).toBeNull();
  });

  it("assigned driver progresses in order only", async () => {
    const api = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverA, now: () => IN_WINDOW });
    const skip = await api.performTripAction({ tripId: "fx-trip-1", action: "picked_up", expectedVersion: 2, idempotencyKey: "p0" });
    expect(skip).toEqual({ ok: false, error: { code: "conflict" } });
    const go = await api.performTripAction({ tripId: "fx-trip-1", action: "en_route", expectedVersion: 2, idempotencyKey: "p1" });
    expect(go.ok && go.data.state).toBe("en_route");
    expect(nextTripState("picked_up", "destination_reached")).toBe("destination_reached");
    expect(tripBookingState("destination_reached")).toBe("completed");
  });

  it("trip commands reject location, coordinates and ETA fields", () => {
    expect(tripCommandSchema.safeParse({ action: "arrived", expectedVersion: 2 }).success).toBe(true);
    for (const extra of [{ lat: 17.1 }, { lng: 78.1 }, { eta: 10 }, { location: "x" }, { coordinates: [1, 2] }]) {
      expect(tripCommandSchema.safeParse({ action: "arrived", expectedVersion: 2, ...extra }).success).toBe(false);
    }
    expect(tripCommandSchema.safeParse({ action: "interrupt", expectedVersion: 2 }).success).toBe(false);
  });
});

describe("emergency dispatch", () => {
  it("is gated by default and never returns an ETA or tracking", async () => {
    const off = getEmergencyGuidance({});
    expect(off).toEqual({ dispatchAvailable: false, reason: "gate_off", callNumber: "112", messageKey: "ambulance.emergency.call112" });
    expect(allKeys(off).filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
    expect(await requestEmergencyDispatch()).toEqual({ ok: false, error: { code: "gated" } });
  });

  it("stays unavailable with the flag ON (S01 A2) and still has no ETA", () => {
    const on = getEmergencyGuidance({ FEATURE_EMERGENCY_DISPATCH: "true", FEATURE_GPS: "true" });
    expect(on.dispatchAvailable).toBe(false);
    expect(on.reason).toBe("not_operational");
    expect(allKeys(on).filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
  });

  it("both adapters expose the same gated guidance", () => {
    expect(createAmbulanceHttpApi({}).getEmergencyGuidance().dispatchAvailable).toBe(false);
    expect(createAmbulanceFixtureApi({ env: {} }).getEmergencyGuidance().dispatchAvailable).toBe(false);
  });

  it("no trip or driver view model carries ETA/tracking keys", () => {
    const keys = allKeys([ambulanceFixtures.trips, selectDriverQueue(ambulanceFixtures.trips, ambulanceActors.driverA, IN_WINDOW)]);
    expect(keys.filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
  });
});

describe("fleet and quotes", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  it("shows vehicle type only when verified and unexpired", () => {
    const [verified, expiringSoon, pending] = ambulanceFixtures.fleet;
    expect(displayVehicleType(verified, now)).toBe("stretcher_capable");
    expect(displayVehicleType(expiringSoon, new Date("2026-11-26T00:00:00Z"))).toBeNull();
    expect(displayVehicleType(pending, now)).toBeNull();
  });

  it("flags stale quotes and inconsistent breakdowns", () => {
    const [first, second] = ambulanceFixtures.requests;
    expect(isQuoteStale(first.quote, now)).toBe(true);
    expect(isQuoteStale(second.quote, now)).toBe(false);
    expect(isQuoteStale(null, now)).toBe(true);
    expect(quoteConsistent(second.quote!)).toBe(true);
    expect(quoteConsistent({ ...second.quote!, totalPaise: 1 })).toBe(false);
  });

  it("unknown trip status never maps to completed", () => {
    expect(describeTrip("completed").known).toBe(false);
    expect(describeTrip("on_the_way").tone).toBe("neutral");
  });
});
