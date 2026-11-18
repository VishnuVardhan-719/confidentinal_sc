/**
 * Scheduled (non-emergency) ambulance transport view models. Names follow S01
 * (`ambulance_vehicles`, `ambulance_drivers`, `transport_trips`).
 * No location coordinates, ETA or tracking fields exist anywhere in this module.
 */

export type IsoUtc = string;
export type Page<T> = { items: T[]; nextCursor: string | null };

export type BookingState =
  | "draft"
  | "requested"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled"
  | "no_show"
  | "interrupted";

export type CredentialStatus = "pending" | "verified" | "rejected" | "expired";

/** Verified descriptor only. Clinical claims (ALS/BLS, oxygen, ventilator) are not offered in core (S01-Q10). */
export type VerifiedVehicleType = "basic_transport" | "wheelchair_accessible" | "stretcher_capable";

export type FleetVehicle = {
  resourceId: string;
  /** Operator's internal label. Registration is shown to the operator only. */
  label: string;
  registrationNumber: string;
  /** Type as verified by review; null until verified. Never a self-declared type. */
  verifiedType: VerifiedVehicleType | null;
  verification: CredentialStatus;
  /** Earliest expiry among registration, permit, fitness and insurance evidence. */
  evidenceExpiresAt: IsoUtc | null;
  baseLocality: string;
  availability: "available" | "unavailable";
  version: number;
};

export type CrewMember = {
  resourceId: string;
  profileId: string;
  displayName: string;
  role: "driver";
  licenceStatus: CredentialStatus;
  licenceExpiresAt: IsoUtc | null;
  availability: "available" | "unavailable";
  membershipStatus: "invited" | "active" | "disabled";
};

export type TransportRequirement = "seated" | "wheelchair" | "stretcher";

export type QuoteFee = { code: "night_surcharge" | "waiting" | "toll" | "other"; amountPaise: number };

export type TransportQuote = {
  basePaise: number;
  distancePaise: number;
  /** Approved distance used for the quote, in whole kilometres (server-derived). */
  distanceKm: number;
  fees: QuoteFee[];
  totalPaise: number;
  quotedAt: IsoUtc;
  validUntil: IsoUtc;
  policyVersion: string;
  version: number;
};

export type PlaceSnapshot = { locality: string; city: string; pin: string | null };

export type ScheduledTransportRequest = {
  id: string;
  reference: string;
  providerId: string;
  bookingState: BookingState;
  /** Operator queue projection: PIN and locality only, no street address or phone. */
  pickup: PlaceSnapshot;
  destination: PlaceSnapshot;
  window: { start: IsoUtc; end: IsoUtc };
  requirement: TransportRequirement;
  quote: TransportQuote | null;
  version: number;
};

/** S01 trip substates plus the shared terminal exceptions shown on trip screens. */
export type TripState =
  | "assigned"
  | "en_route"
  | "arrived"
  | "picked_up"
  | "destination_reached"
  | "trip_interrupted"
  | "cancelled"
  | "no_show";

export type TripAction = "en_route" | "arrived" | "picked_up" | "destination_reached" | "interrupt";

export type TripInterruptReason =
  | "patient_not_present"
  | "vehicle_breakdown"
  | "unsafe_conditions"
  | "requirement_mismatch"
  | "medical_emergency_redirected"
  | "driver_unable";

export type Trip = {
  id: string;
  bookingId: string;
  reference: string;
  providerId: string;
  state: TripState;
  vehicle: { resourceId: string; label: string; verifiedType: VerifiedVehicleType | null };
  driver: { resourceId: string; displayName: string };
  pickup: PlaceSnapshot;
  destination: PlaceSnapshot;
  window: { start: IsoUtc; end: IsoUtc };
  requirement: TransportRequirement;
  interruption: { reason: TripInterruptReason; recordedAt: IsoUtc } | null;
  history: { state: TripState; at: IsoUtc }[];
  version: number;
};

/** What a driver sees: their own assigned trip only, minimum necessary fields. */
export type DriverTripView = {
  tripId: string;
  reference: string;
  state: TripState;
  pickup: PlaceSnapshot;
  destination: PlaceSnapshot;
  window: { start: IsoUtc; end: IsoUtc };
  requirement: TransportRequirement;
  vehicleLabel: string;
  version: number;
};

export type AmbulanceActor = {
  profileId: string;
  providerId: string;
  /** Driver person resource, when the actor is a driver. */
  resourceId: string | null;
  roles: readonly ("operator" | "driver")[];
  membershipStatus: "invited" | "active" | "disabled";
};

export type TripActionInput = {
  tripId: string;
  action: TripAction;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: TripInterruptReason;
};
