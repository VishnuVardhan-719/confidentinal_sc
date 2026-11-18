import { fail, ok, type ApiResult } from "@/lib/api/result";
import { ambulanceActors, ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import type { AmbulanceApi, TripQueue } from "./api";
import { getEmergencyGuidance } from "./emergency";
import { nextTripState, selectDriverTrips, TERMINAL_TRIP_STATES, toDriverTripView, tripActionDenial } from "./rules";
import type { AmbulanceActor, DriverTripView, Trip } from "./types";

export type AmbulanceFixtureOptions = {
  env?: Record<string, string | undefined>;
  actor?: AmbulanceActor;
  now?: () => Date;
};

const kolkataDay = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** Synthetic ambulance adapter. Simulates server authorization; refuses production. */
export function createAmbulanceFixtureApi(options: AmbulanceFixtureOptions = {}): AmbulanceApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const actor: AmbulanceActor = options.actor ?? ambulanceActors.operator;
  const now = options.now ?? (() => new Date());
  const data = cloneFixture(ambulanceFixtures);
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
    async listTrips({ queue }) {
      return isOperator() ? ok({ items: data.trips.filter((t) => inQueue(t, queue)), nextCursor: null }) : fail("forbidden");
    },
    async getTrip(tripId) {
      const found = data.trips.find((t) => t.id === tripId);
      return isOperator() && found ? ok(found) : fail("not_found");
    },
    async listDriverTrips() {
      if (actor.membershipStatus !== "active" || !actor.roles.includes("driver")) return fail("forbidden");
      return ok(selectDriverTrips(data.trips, actor));
    },
    async getDriverTrip(tripId) {
      const visible = selectDriverTrips(data.trips, actor).find((t) => t.tripId === tripId);
      // Privacy-safe: another driver's trip looks exactly like a missing one.
      return visible ? ok(visible) : fail("not_found");
    },
    async performTripAction(input) {
      return once("trip", input.idempotencyKey, (): ApiResult<DriverTripView> => {
        const trip = assignedTrip(input.tripId);
        if (!trip) return fail("not_found");
        const denial = tripActionDenial(actor, trip, input.action, input.reason);
        if (denial === "membership_inactive") return fail("forbidden");
        if (denial === "not_assigned") return fail("not_found");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (trip.version !== input.expectedVersion) return fail("conflict");
        const next = nextTripState(trip.state, input.action);
        if (next === null) return fail("conflict");
        const at = now().toISOString();
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
