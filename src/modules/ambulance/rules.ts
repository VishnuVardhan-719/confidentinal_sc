import { z } from "zod";
import type {
  AmbulanceActor,
  BookingState,
  CrewMember,
  DeclineReason,
  DriverQueueView,
  DriverTripView,
  FleetVehicle,
  TransportQuote,
  Trip,
  TripAction,
  TripInterruptReason,
  TripState,
  VerifiedVehicleType,
} from "./types";

const expired = (iso: string | null, now: Date): boolean => {
  if (iso === null) return true; // missing expiry fails closed
  const t = Date.parse(iso);
  return !Number.isFinite(t) || t <= now.getTime();
};

/** Vehicle type is shown only when verified and evidence is unexpired. Otherwise null (show "not verified"). */
export function displayVehicleType(vehicle: FleetVehicle, now: Date = new Date()): VerifiedVehicleType | null {
  if (vehicle.verification !== "verified") return null;
  if (expired(vehicle.evidenceExpiresAt, now)) return null;
  return vehicle.verifiedType;
}

export function vehicleAssignable(vehicle: FleetVehicle, now: Date = new Date()): boolean {
  return displayVehicleType(vehicle, now) !== null && vehicle.availability === "available";
}

export function driverAssignable(member: CrewMember, now: Date = new Date()): boolean {
  return (
    member.membershipStatus === "active" &&
    member.licenceStatus === "verified" &&
    !expired(member.licenceExpiresAt, now) &&
    member.availability === "available"
  );
}

/** Days until the earliest evidence expiry, for credential-expiry warnings. Null when unknown. */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((t - now.getTime()) / 86_400_000) : null;
}

/** A quote at or past validUntil is stale; acceptance must re-quote, never silently reuse it. */
export function isQuoteStale(quote: TransportQuote | null, now: Date = new Date()): boolean {
  if (quote === null) return true;
  const until = Date.parse(quote.validUntil);
  return !Number.isFinite(until) || until <= now.getTime();
}

/** The server-provided breakdown must add up exactly; mismatches are shown as an error, not recomputed. */
export function quoteConsistent(quote: TransportQuote): boolean {
  const parts = [quote.basePaise, quote.distancePaise, ...quote.fees.map((f) => f.amountPaise)];
  if (!parts.every((p) => Number.isSafeInteger(p) && p >= 0)) return false;
  return parts.reduce((a, b) => a + b, 0) === quote.totalPaise;
}

const TRIP_TRANSITIONS: Record<TripAction, { from: readonly TripState[]; to: TripState }> = {
  en_route: { from: ["assigned"], to: "en_route" },
  arrived: { from: ["en_route"], to: "arrived" },
  picked_up: { from: ["arrived"], to: "picked_up" },
  destination_reached: { from: ["picked_up"], to: "destination_reached" },
  interrupt: { from: ["assigned", "en_route", "arrived", "picked_up"], to: "trip_interrupted" },
};

export const TERMINAL_TRIP_STATES: readonly TripState[] = ["destination_reached", "trip_interrupted", "cancelled", "no_show"];

export function nextTripState(current: TripState, action: TripAction): TripState | null {
  const rule = TRIP_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

/** Shared booking state for a trip state (S01 table). */
export function tripBookingState(state: TripState): BookingState {
  switch (state) {
    case "assigned":
    case "en_route":
    case "arrived":
      return "confirmed";
    case "picked_up":
      return "in_progress";
    case "destination_reached":
      return "completed";
    case "trip_interrupted":
      return "interrupted";
    case "cancelled":
      return "cancelled";
    case "no_show":
      return "no_show";
  }
}

export const TRIP_INTERRUPT_REASONS = [
  "patient_not_present",
  "vehicle_breakdown",
  "unsafe_conditions",
  "requirement_mismatch",
  "medical_emergency_redirected",
  "driver_unable",
] as const satisfies readonly TripInterruptReason[];

/**
 * Strict trip command body. Any location, coordinate, ETA or tracking field is
 * rejected (S01 A9), regardless of the GPS flag.
 */
export const tripCommandSchema = z.strictObject({
  action: z.enum(["en_route", "arrived", "picked_up", "destination_reached", "interrupt"]),
  expectedVersion: z.number().int().positive(),
  reason: z.enum(TRIP_INTERRUPT_REASONS).optional(),
}).refine((v) => (v.action === "interrupt") === (v.reason !== undefined), { path: ["reason"] });

export const DECLINE_REASONS = ["patient_request", "provider_unavailable", "unable_to_service", "other"] as const satisfies readonly DeclineReason[];

export type TripDenial = "membership_inactive" | "not_assigned" | "invalid_transition" | "reason_required" | "outside_window";

/**
 * Driver view window (FE spec 13 "assigned current trip only"). A trip already
 * under way is always current; an assigned trip becomes current this many
 * minutes before its window starts. PROPOSED value for synthetic staging; the
 * server is authoritative and must reject milestones outside its own window
 * (REQUESTS.md R-E15).
 */
export const DRIVER_VIEW_LEAD_MINUTES = 120;

const UNDER_WAY: readonly TripState[] = ["en_route", "arrived", "picked_up"];

/** Is this trip the driver's current work? Unparseable windows fail closed. */
export function tripInDriverWindow(trip: Pick<Trip, "state" | "window">, now: Date = new Date()): boolean {
  if (TERMINAL_TRIP_STATES.includes(trip.state)) return false;
  if (UNDER_WAY.includes(trip.state)) return true;
  const start = Date.parse(trip.window.start);
  return Number.isFinite(start) && now.getTime() >= start - DRIVER_VIEW_LEAD_MINUTES * 60_000;
}

/** Only the assigned driver may progress a trip, and only while it is current. Operator managers cannot record driver milestones (S01 A11). */
export function tripActionDenial(
  actor: AmbulanceActor,
  trip: Trip,
  action: TripAction,
  reason?: TripInterruptReason,
  now: Date = new Date(),
): TripDenial | null {
  if (actor.membershipStatus !== "active") return "membership_inactive";
  if (actor.providerId !== trip.providerId || !actor.roles.includes("driver") || actor.resourceId === null) return "not_assigned";
  if (trip.driver.resourceId !== actor.resourceId) return "not_assigned";
  if (nextTripState(trip.state, action) === null) return "invalid_transition";
  if (!tripInDriverWindow(trip, now)) return "outside_window";
  if (action === "interrupt" && (reason === undefined || !TRIP_INTERRUPT_REASONS.includes(reason))) return "reason_required";
  return null;
}

export function toDriverTripView(trip: Trip): DriverTripView {
  return {
    tripId: trip.id,
    reference: trip.reference,
    state: trip.state,
    pickup: trip.pickup,
    destination: trip.destination,
    window: trip.window,
    requirement: trip.requirement,
    vehicleLabel: trip.vehicle.label,
    version: trip.version,
  };
}

/**
 * Driver queue: at most ONE current trip with its pickup/destination, plus a
 * bare count of later assignments (no references, places or times).
 */
export function selectDriverQueue(trips: readonly Trip[], actor: AmbulanceActor, now: Date = new Date()): DriverQueueView {
  if (actor.membershipStatus !== "active" || !actor.roles.includes("driver") || actor.resourceId === null) {
    return { current: null, laterCount: 0 };
  }
  const mine = trips
    .filter((t) => t.providerId === actor.providerId && t.driver.resourceId === actor.resourceId && !TERMINAL_TRIP_STATES.includes(t.state))
    .sort((a, b) => Date.parse(a.window.start) - Date.parse(b.window.start));
  const current = mine.find((t) => UNDER_WAY.includes(t.state)) ?? mine.find((t) => tripInDriverWindow(t, now)) ?? null;
  return { current: current ? toDriverTripView(current) : null, laterCount: mine.length - (current ? 1 : 0) };
}