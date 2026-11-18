import { fail, ok, type ApiResult } from "@/lib/api/result";
import { ambulanceActors, ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import type { AmbulanceApi, TripQueue } from "./api";
import { getEmergencyGuidance } from "./emergency";
import {
  DECLINE_REASONS,
  driverAssignable,
  isQuoteStale,
  nextTripState,
  quoteConsistent,
  selectDriverQueue,
  TERMINAL_TRIP_STATES,
  toDriverTripView,
  tripActionDenial,
  vehicleAssignable,
} from "./rules";
import type { AmbulanceActor, DriverTripView, ScheduledTransportRequest, Trip } from "./types";

export type AmbulanceFixtureStore = ReturnType<typeof createAmbulanceFixtureStore>;

/** Mutable synthetic state. Shared per process in fixture mode so changes survive a page refresh. */
export function createAmbulanceFixtureStore() {
  return cloneFixture(ambulanceFixtures);
}

export type AmbulanceFixtureOptions = {
  env?: Record<string, string | undefined>;
  actor?: AmbulanceActor;
  now?: () => Date;
  store?: AmbulanceFixtureStore;
};

const kolkataDay = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** Synthetic ambulance adapter. Simulates server authorization; refuses production. */
export function createAmbulanceFixtureApi(options: AmbulanceFixtureOptions = {}): AmbulanceApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const actor: AmbulanceActor = options.actor ?? ambulanceActors.operator;
  const now = options.now ?? (() => new Date());
  const data = options.store ?? createAmbulanceFixtureStore();
  const once = createReplayCache();

  const isOperator = () =>
    actor.membershipStatus === "active" && actor.providerId === data.providerId && actor.roles.includes("operator");

  const inQueue = (trip: Trip, queue: TripQueue): boolean => {
    const terminal = TERMINAL_TRIP_STATES.includes(trip.state);
    if (queue === "exceptions") return trip.state === "trip_interrupted" || trip.state === "no_show";
    if (terminal) return false;
    const today = kolkataDay(now());
    const day = kolkataDay(new Date(trip.window.start));
    return queue === "today" ? day === today : day > today;
  };

  const assignedTrip = (tripId: string): Trip | undefined =>
    data.trips.find((t) => t.id === tripId && actor.resourceId !== null && t.driver.resourceId === actor.resourceId);

  return {
    mode: "fixture",

    async listFleet() {
      return isOperator() ? ok(data.fleet) : fail("forbidden");
    },
    async listCrew() {
      return isOperator() ? ok(data.crew) : fail("forbidden");
    },
    async listRequests() {
      return isOperator() ? ok({ items: data.requests, nextCursor: null }) : fail("forbidden");
    },
    async getRequest(requestId) {
      const found = data.requests.find((r) => r.id === requestId);
      return isOperator() && found ? ok(found) : fail("not_found");
    },
    async decideRequest(input) {
      return once("decide", input.idempotencyKey, (): ApiResult<ScheduledTransportRequest> => {
        if (!isOperator()) return fail("forbidden");
        const request = data.requests.find((r) => r.id === input.requestId);
        if (!request) return fail("not_found");
        if (request.version !== input.expectedVersion || request.bookingState !== "requested") return fail("conflict");
        const instant = now();
        if (input.decision === "decline") {
          if (!DECLINE_REASONS.includes(input.reason)) return fail("validation", { fields: { reason: "required" } });
          request.bookingState = "declined";
          request.version += 1;
          return ok(cloneFixture(request));
        }
        if (isQuoteStale(request.quote, instant) || !request.quote || !quoteConsistent(request.quote)) return fail("conflict");
        const vehicle = data.fleet.find((v) => v.resourceId === input.vehicleResourceId);
        const driver = data.crew.find((c) => c.resourceId === input.driverResourceId);
        if (!vehicle || !vehicleAssignable(vehicle, instant)) return fail("validation", { fields: { vehicleResourceId: "not_eligible" } });
        if (!driver || !driverAssignable(driver, instant)) return fail("validation", { fields: { driverResourceId: "not_eligible" } });
        request.bookingState = "confirmed";
        request.version += 1;
        data.trips.push({
          id: `fx-trip-${request.id}`,
          bookingId: request.id,
          reference: request.reference,
          providerId: request.providerId,
          state: "assigned",
          vehicle: { resourceId: vehicle.resourceId, label: vehicle.label, verifiedType: vehicle.verifiedType },
          driver: { resourceId: driver.resourceId, displayName: driver.displayName },
          pickup: request.pickup,
          destination: request.destination,
          window: request.window,
          requirement: request.requirement,
          interruption: null,
          history: [{ state: "assigned", at: instant.toISOString() }],
          version: 1,
        });
        return ok(cloneFixture(request));
      });
    },
    async listTrips({ queue }) {
      return isOperator() ? ok({ items: data.trips.filter((t) => inQueue(t, queue)), nextCursor: null }) : fail("forbidden");
    },
    async getTrip(tripId) {
      const found = data.trips.find((t) => t.id === tripId);
      return isOperator() && found ? ok(found) : fail("not_found");
    },
    async getDriverQueue() {
      if (actor.membershipStatus !== "active" || !actor.roles.includes("driver")) return fail("forbidden");
      return ok(selectDriverQueue(data.trips, actor, now()));
    },
    async getDriverTrip(tripId) {
      const { current } = selectDriverQueue(data.trips, actor, now());
      // Privacy-safe: another driver's trip, or a later one, looks exactly like a missing one.
      return current && current.tripId === tripId ? ok(current) : fail("not_found");
    },
    async performTripAction(input) {
      return once("trip", input.idempotencyKey, (): ApiResult<DriverTripView> => {
        // One clock reading for selection, denial and the recorded timestamp.
        const instant = now();
        const trip = assignedTrip(input.tripId);
        if (!trip) return fail("not_found");
        // Only the driver's CURRENT trip may be progressed (FE spec 13). Another assigned trip, even
        // one already inside its window, is indistinguishable from a missing one and is never mutated.
        // The check runs before the mutation, so a final milestone (destination_reached) on the
        // current trip is still accepted even though it makes the trip terminal.
        if (selectDriverQueue(data.trips, actor, instant).current?.tripId !== trip.id) return fail("not_found");
        const denial = tripActionDenial(actor, trip, input.action, input.reason, instant);
        if (denial === "membership_inactive") return fail("forbidden");
        if (denial === "outside_window") return fail("conflict");
        if (denial === "not_assigned") return fail("not_found");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (trip.version !== input.expectedVersion) return fail("conflict");
        const next = nextTripState(trip.state, input.action);
        if (next === null) return fail("conflict");
        const at = instant.toISOString();
        trip.state = next;
        if (input.action === "interrupt" && input.reason) trip.interruption = { reason: input.reason, recordedAt: at };
        trip.history.push({ state: next, at });
        trip.version += 1;
        return ok(toDriverTripView(cloneFixture(trip)));
      });
    },
    getEmergencyGuidance: () => getEmergencyGuidance(env),
  };
}
