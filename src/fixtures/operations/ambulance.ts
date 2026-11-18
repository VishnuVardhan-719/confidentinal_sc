import type { AmbulanceActor, CrewMember, FleetVehicle, ScheduledTransportRequest, Trip } from "@/modules/ambulance/types";
import { SYNTHETIC_MARKER } from "./guard";

/** SYNTHETIC scheduled-transport scenarios. Fictional operator, vehicles, crew and places. */

const PROVIDER = "fx-amb-provider-1";

const fleet: FleetVehicle[] = [
  { resourceId: "fx-veh-1", label: "Fixture Van 1", registrationNumber: "FX00TEST0001", verifiedType: "stretcher_capable", verification: "verified", evidenceExpiresAt: "2027-03-31T00:00:00Z", baseLocality: "Fixture Nagar", availability: "available", version: 2 },
  { resourceId: "fx-veh-2", label: "Fixture Van 2", registrationNumber: "FX00TEST0002", verifiedType: "wheelchair_accessible", verification: "verified", evidenceExpiresAt: "2026-11-25T00:00:00Z", baseLocality: "Fixture Nagar", availability: "available", version: 1 },
  { resourceId: "fx-veh-3", label: "Fixture Van 3", registrationNumber: "FX00TEST0003", verifiedType: null, verification: "pending", evidenceExpiresAt: null, baseLocality: "Mock Colony", availability: "unavailable", version: 1 },
];

const crew: CrewMember[] = [
  { resourceId: "fx-res-driver-a", profileId: "fx-prof-driver-a", displayName: "Fixture Driver A", role: "driver", licenceStatus: "verified", licenceExpiresAt: "2028-01-01T00:00:00Z", availability: "available", membershipStatus: "active" },
  { resourceId: "fx-res-driver-b", profileId: "fx-prof-driver-b", displayName: "Fixture Driver B", role: "driver", licenceStatus: "verified", licenceExpiresAt: "2027-06-01T00:00:00Z", availability: "available", membershipStatus: "active" },
  { resourceId: "fx-res-driver-c", profileId: "fx-prof-driver-c", displayName: "Fixture Driver C", role: "driver", licenceStatus: "expired", licenceExpiresAt: "2026-10-01T00:00:00Z", availability: "unavailable", membershipStatus: "active" },
];

const place = (locality: string, pin: string | null) => ({ locality, city: "Sample City", pin });

const requests: ScheduledTransportRequest[] = [
  {
    id: "fx-amb-req-1",
    reference: "#SCV-BKG-900301",
    providerId: PROVIDER,
    bookingState: "requested",
    pickup: place("Fixture Nagar", "999901"),
    destination: place("Fixture General Hospital area", null),
    window: { start: "2026-11-21T04:00:00Z", end: "2026-11-21T05:00:00Z" },
    requirement: "wheelchair",
    quote: { basePaise: 80000, distancePaise: 36000, distanceKm: 12, fees: [], totalPaise: 116000, quotedAt: "2026-11-19T04:00:00Z", validUntil: "2026-11-19T12:00:00Z", policyVersion: "fx-policy-v1", version: 1 },
    version: 1,
  },
  {
    id: "fx-amb-req-2",
    reference: "#SCV-BKG-900302",
    providerId: PROVIDER,
    bookingState: "requested",
    pickup: place("Mock Colony", "999903"),
    destination: place("Fixture Nagar", "999901"),
    window: { start: "2026-11-22T10:00:00Z", end: "2026-11-22T11:00:00Z" },
    requirement: "stretcher",
    quote: { basePaise: 90000, distancePaise: 24000, distanceKm: 8, fees: [{ code: "night_surcharge", amountPaise: 20000 }], totalPaise: 134000, quotedAt: "2026-11-19T04:00:00Z", validUntil: "2026-11-21T04:00:00Z", policyVersion: "fx-policy-v1", version: 1 },
    version: 1,
  },
];

const trips: Trip[] = [
  {
    id: "fx-trip-1",
    bookingId: "fx-amb-booking-1",
    reference: "#SCV-BKG-900311",
    providerId: PROVIDER,
    state: "assigned",
    vehicle: { resourceId: "fx-veh-1", label: "Fixture Van 1", verifiedType: "stretcher_capable" },
    driver: { resourceId: "fx-res-driver-a", displayName: "Fixture Driver A" },
    pickup: place("Fixture Nagar", "999901"),
    destination: place("Fixture General Hospital area", null),
    window: { start: "2026-11-20T04:00:00Z", end: "2026-11-20T05:00:00Z" },
    requirement: "stretcher",
    interruption: null,
    history: [{ state: "assigned", at: "2026-11-19T06:00:00Z" }],
    version: 2,
  },
  {
    id: "fx-trip-2",
    bookingId: "fx-amb-booking-2",
    reference: "#SCV-BKG-900312",
    providerId: PROVIDER,
    state: "en_route",
    vehicle: { resourceId: "fx-veh-2", label: "Fixture Van 2", verifiedType: "wheelchair_accessible" },
    driver: { resourceId: "fx-res-driver-b", displayName: "Fixture Driver B" },
    pickup: place("Mock Colony", "999903"),
    destination: place("Fixture Nagar", "999901"),
    window: { start: "2026-11-20T06:00:00Z", end: "2026-11-20T07:00:00Z" },
    requirement: "wheelchair",
    interruption: null,
    history: [
      { state: "assigned", at: "2026-11-19T06:00:00Z" },
      { state: "en_route", at: "2026-11-20T05:40:00Z" },
    ],
    version: 3,
  },
  {
    id: "fx-trip-3",
    bookingId: "fx-amb-booking-3",
    reference: "#SCV-BKG-900313",
    providerId: PROVIDER,
    state: "destination_reached",
    vehicle: { resourceId: "fx-veh-1", label: "Fixture Van 1", verifiedType: "stretcher_capable" },
    driver: { resourceId: "fx-res-driver-a", displayName: "Fixture Driver A" },
    pickup: place("Fixture Nagar", "999901"),
    destination: place("Mock Colony", "999903"),
    window: { start: "2026-11-18T04:00:00Z", end: "2026-11-18T05:00:00Z" },
    requirement: "seated",
    interruption: null,
    history: [{ state: "destination_reached", at: "2026-11-18T05:10:00Z" }],
    version: 6,
  },
  {
    id: "fx-trip-4",
    bookingId: "fx-amb-booking-4",
    reference: "#SCV-BKG-900314",
    providerId: PROVIDER,
    state: "trip_interrupted",
    vehicle: { resourceId: "fx-veh-2", label: "Fixture Van 2", verifiedType: "wheelchair_accessible" },
    driver: { resourceId: "fx-res-driver-b", displayName: "Fixture Driver B" },
    pickup: place("Mock Colony", "999903"),
    destination: place("Fixture Nagar", "999901"),
    window: { start: "2026-11-19T04:00:00Z", end: "2026-11-19T05:00:00Z" },
    requirement: "wheelchair",
    interruption: { reason: "patient_not_present", recordedAt: "2026-11-19T04:30:00Z" },
    history: [{ state: "trip_interrupted", at: "2026-11-19T04:30:00Z" }],
    version: 4,
  },
];

export const ambulanceActors = {
  operator: { profileId: "fx-prof-amb-operator", providerId: PROVIDER, resourceId: null, roles: ["operator"], membershipStatus: "active" },
  driverA: { profileId: "fx-prof-driver-a", providerId: PROVIDER, resourceId: "fx-res-driver-a", roles: ["driver"], membershipStatus: "active" },
  driverB: { profileId: "fx-prof-driver-b", providerId: PROVIDER, resourceId: "fx-res-driver-b", roles: ["driver"], membershipStatus: "active" },
} as const satisfies Record<string, AmbulanceActor>;

export const ambulanceFixtures = { ...SYNTHETIC_MARKER, providerId: PROVIDER, fleet, crew, requests, trips };
