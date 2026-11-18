import type { Metric } from "@/modules/admin/access";
import {
  daysUntil,
  displayVehicleType,
  driverAssignable,
  isQuoteStale,
  nextTripState,
  quoteConsistent,
  tripActionDenial,
  vehicleAssignable,
} from "./rules";
import { describeAvailability, describeCredential, describeQuote, describeTrip, describeVehicleType, type StatusDescriptor } from "./status";
import type {
  AmbulanceActor,
  CrewMember,
  DriverTripView,
  FleetVehicle,
  ScheduledTransportRequest,
  Trip,
  TripAction,
} from "./types";

/** Credential expiry warning window for the operator dashboard. */
export const EXPIRY_WARNING_DAYS = 30;

export type ExpiryWarningVM = { kind: "vehicle" | "driver"; resourceId: string; label: string; expiresAt: string; daysLeft: number };

export type AmbulanceDashboardVM = {
  roles: AmbulanceActor["roles"];
  operator: {
    pendingRequests: Metric;
    todayTrips: Metric;
    assignableVehicles: Metric;
    assignableDrivers: Metric;
    expiring: ExpiryWarningVM[] | null;
  } | null;
  driver: { assignedTrips: Metric } | null;
};

export type VehicleRowVM = {
  resourceId: string;
  label: string;
  registrationNumber: string;
  /** Verified type only; otherwise the explicit "not verified" label. */
  type: StatusDescriptor;
  verification: StatusDescriptor;
  availability: StatusDescriptor;
  evidenceExpiresAt: string | null;
  daysToExpiry: number | null;
  assignable: boolean;
  baseLocality: string;
};

export const toVehicleRow = (v: FleetVehicle, now: Date): VehicleRowVM => ({
  resourceId: v.resourceId,
  label: v.label,
  registrationNumber: v.registrationNumber,
  type: describeVehicleType(displayVehicleType(v, now)),
  verification: describeCredential(v.verification),
  availability: describeAvailability(v.availability),
  evidenceExpiresAt: v.evidenceExpiresAt,
  daysToExpiry: daysUntil(v.evidenceExpiresAt, now),
  assignable: vehicleAssignable(v, now),
  baseLocality: v.baseLocality,
});

export type CrewRowVM = {
  resourceId: string;
  displayName: string;
  licence: StatusDescriptor;
  licenceExpiresAt: string | null;
  daysToExpiry: number | null;
  availability: StatusDescriptor;
  assignable: boolean;
};

export const toCrewRow = (c: CrewMember, now: Date): CrewRowVM => ({
  resourceId: c.resourceId,
  displayName: c.displayName,
  licence: describeCredential(c.licenceStatus),
  licenceExpiresAt: c.licenceExpiresAt,
  daysToExpiry: daysUntil(c.licenceExpiresAt, now),
  availability: describeAvailability(c.availability),
  assignable: driverAssignable(c, now),
});

export function expiryWarnings(fleet: readonly FleetVehicle[], crew: readonly CrewMember[], now: Date): ExpiryWarningVM[] {
  const out: ExpiryWarningVM[] = [];
  for (const v of fleet) {
    const d = daysUntil(v.evidenceExpiresAt, now);
    if (v.evidenceExpiresAt && d !== null && d <= EXPIRY_WARNING_DAYS) out.push({ kind: "vehicle", resourceId: v.resourceId, label: v.label, expiresAt: v.evidenceExpiresAt, daysLeft: d });
  }
  for (const c of crew) {
    const d = daysUntil(c.licenceExpiresAt, now);
    if (c.licenceExpiresAt && d !== null && d <= EXPIRY_WARNING_DAYS) out.push({ kind: "driver", resourceId: c.resourceId, label: c.displayName, expiresAt: c.licenceExpiresAt, daysLeft: d });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export type AcceptBlocker = "quote_missing" | "quote_stale" | "quote_inconsistent" | "no_vehicle" | "no_driver" | "not_requested";

export type RequestRowVM = {
  id: string;
  reference: string;
  pickup: ScheduledTransportRequest["pickup"];
  destination: ScheduledTransportRequest["destination"];
  windowStart: string;
  windowEnd: string;
  requirementKey: string;
  quote: (NonNullable<ScheduledTransportRequest["quote"]> & { status: StatusDescriptor }) | null;
  /** Accept is offered only when this is empty; decline is always available for a requested booking. */
  acceptBlockers: AcceptBlocker[];
  canDecline: boolean;
  version: number;
};

/** Manual accept needs a fresh, consistent quote and at least one assignable vehicle and driver. */
export function toRequestRow(
  r: ScheduledTransportRequest,
  fleet: readonly FleetVehicle[] | null,
  crew: readonly CrewMember[] | null,
  now: Date,
): RequestRowVM {
  const blockers: AcceptBlocker[] = [];
  if (r.bookingState !== "requested") blockers.push("not_requested");
  if (r.quote === null) blockers.push("quote_missing");
  else {
    if (isQuoteStale(r.quote, now)) blockers.push("quote_stale");
    if (!quoteConsistent(r.quote)) blockers.push("quote_inconsistent");
  }
  // Unknown capacity (failed load) blocks acceptance rather than assuming capacity.
  if (!fleet || !fleet.some((v) => vehicleAssignable(v, now))) blockers.push("no_vehicle");
  if (!crew || !crew.some((c) => driverAssignable(c, now))) blockers.push("no_driver");
  return {
    id: r.id,
    reference: r.reference,
    pickup: r.pickup,
    destination: r.destination,
    windowStart: r.window.start,
    windowEnd: r.window.end,
    requirementKey: `ambulance.requirement.${r.requirement}`,
    quote: r.quote ? { ...r.quote, status: describeQuote(isQuoteStale(r.quote, now)) } : null,
    acceptBlockers: blockers,
    canDecline: r.bookingState === "requested",
    version: r.version,
  };
}

export type TripRowVM = {
  id: string;
  reference: string;
  status: StatusDescriptor;
  vehicleLabel: string;
  vehicleType: StatusDescriptor;
  driverName: string;
  pickup: Trip["pickup"];
  destination: Trip["destination"];
  windowStart: string;
  windowEnd: string;
  requirementKey: string;
  interruptionKey: string | null;
  history: { status: StatusDescriptor; at: string }[];
  version: number;
};

export const toTripRow = (t: Trip): TripRowVM => ({
  id: t.id,
  reference: t.reference,
  status: describeTrip(t.state),
  vehicleLabel: t.vehicle.label,
  vehicleType: describeVehicleType(t.vehicle.verifiedType),
  driverName: t.driver.displayName,
  pickup: t.pickup,
  destination: t.destination,
  windowStart: t.window.start,
  windowEnd: t.window.end,
  requirementKey: `ambulance.requirement.${t.requirement}`,
  interruptionKey: t.interruption ? `ambulance.interrupt.${t.interruption.reason}` : null,
  history: t.history.map((h) => ({ status: describeTrip(h.state), at: h.at })),
  version: t.version,
});

const DRIVER_ACTIONS: readonly Exclude<TripAction, "interrupt">[] = ["en_route", "arrived", "picked_up", "destination_reached"];

export type DriverTripVM = {
  tripId: string;
  reference: string;
  status: StatusDescriptor;
  pickup: DriverTripView["pickup"];
  destination: DriverTripView["destination"];
  windowStart: string;
  windowEnd: string;
  requirementKey: string;
  vehicleLabel: string;
  /** The single next milestone, if any. No ETA, countdown or map. */
  nextAction: Exclude<TripAction, "interrupt"> | null;
  canInterrupt: boolean;
  version: number;
};

export function toDriverTrip(view: DriverTripView): DriverTripVM {
  return {
    tripId: view.tripId,
    reference: view.reference,
    status: describeTrip(view.state),
    pickup: view.pickup,
    destination: view.destination,
    windowStart: view.window.start,
    windowEnd: view.window.end,
    requirementKey: `ambulance.requirement.${view.requirement}`,
    vehicleLabel: view.vehicleLabel,
    nextAction: DRIVER_ACTIONS.find((a) => nextTripState(view.state, a) !== null) ?? null,
    canInterrupt: nextTripState(view.state, "interrupt") !== null,
    version: view.version,
  };
}

/** Re-check on the full trip (operator screens): which driver action is valid for this actor. */
export const driverMayAct = (actor: AmbulanceActor, trip: Trip, action: TripAction): boolean =>
  tripActionDenial(actor, trip, action, action === "interrupt" ? "driver_unable" : undefined) === null;
