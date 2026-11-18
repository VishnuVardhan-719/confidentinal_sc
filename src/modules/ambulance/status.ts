import type { CredentialStatus, TripState, VerifiedVehicleType } from "./types";

/**
 * Canonical ambulance status label keys (namespace `ambulance`) and tones.
 * Unknown values map to neutral "unknown", never to verified/available/completed.
 * No label may contain a minutes/ETA estimate (S01 A13).
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "ambulance.status.unknown", tone: "neutral", known: false };

function describe<K extends string>(map: Readonly<Record<K, readonly [string, StatusTone]>>, raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(map, raw)) return UNKNOWN;
  const [labelKey, tone] = map[raw as K];
  return { labelKey, tone, known: true };
}

const TRIP: Record<TripState, readonly [string, StatusTone]> = {
  assigned: ["ambulance.status.trip.assigned", "info"],
  en_route: ["ambulance.status.trip.enRoute", "info"],
  arrived: ["ambulance.status.trip.arrived", "info"],
  picked_up: ["ambulance.status.trip.pickedUp", "info"],
  destination_reached: ["ambulance.status.trip.destinationReached", "success"],
  trip_interrupted: ["ambulance.status.trip.interrupted", "danger"],
  cancelled: ["ambulance.status.trip.cancelled", "neutral"],
  no_show: ["ambulance.status.trip.noShow", "warning"],
};

const CREDENTIAL: Record<CredentialStatus, readonly [string, StatusTone]> = {
  pending: ["ambulance.status.credential.pending", "warning"],
  verified: ["ambulance.status.credential.verified", "success"],
  rejected: ["ambulance.status.credential.rejected", "danger"],
  expired: ["ambulance.status.credential.expired", "danger"],
};

const VEHICLE_TYPE: Record<VerifiedVehicleType, readonly [string, StatusTone]> = {
  basic_transport: ["ambulance.vehicleType.basicTransport", "neutral"],
  wheelchair_accessible: ["ambulance.vehicleType.wheelchairAccessible", "neutral"],
  stretcher_capable: ["ambulance.vehicleType.stretcherCapable", "neutral"],
};

const AVAILABILITY = {
  available: ["ambulance.status.availability.available", "success"],
  unavailable: ["ambulance.status.availability.unavailable", "neutral"],
} as const satisfies Record<string, readonly [string, StatusTone]>;

const QUOTE = {
  current: ["ambulance.status.quote.current", "info"],
  stale: ["ambulance.status.quote.stale", "warning"],
} as const satisfies Record<string, readonly [string, StatusTone]>;

export const describeTrip = (raw: unknown): StatusDescriptor => describe(TRIP, raw);
export const describeCredential = (raw: unknown): StatusDescriptor => describe(CREDENTIAL, raw);
export const describeAvailability = (raw: unknown): StatusDescriptor => describe(AVAILABILITY, raw);
export const describeQuote = (stale: boolean): StatusDescriptor => describe(QUOTE, stale ? "stale" : "current");
/** Null (unverified) type renders the explicit "not verified" label, never a guessed type. */
export const describeVehicleType = (raw: unknown): StatusDescriptor =>
  raw === null ? { labelKey: "ambulance.vehicleType.notVerified", tone: "warning", known: true } : describe(VEHICLE_TYPE, raw);
