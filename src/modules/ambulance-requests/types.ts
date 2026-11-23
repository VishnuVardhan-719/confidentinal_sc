import type { BaseProvider, ServiceRequest } from "@/modules/service-requests/core";

/**
 * Patient-side scheduled, NON-EMERGENCY ambulance transfers (for example hospital discharge or a planned
 * appointment). There is no live dispatch, tracking or ETA; emergencies go to 108.
 */
export const VEHICLE_TYPES = ["patient_transport", "wheelchair_van", "basic_life_support"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const MOBILITY = ["walks", "wheelchair", "stretcher"] as const;
export type Mobility = (typeof MOBILITY)[number];
export const DESTINATION_KINDS = ["hospital", "home", "other"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export type AmbulanceProvider = BaseProvider & { category: "ambulance"; vehicles: { type: VehicleType; farePaise: number }[] };
export type Destination = { kind: DestinationKind; name?: string; locality: string; city: string; pin: string };
export type AmbulanceRequestDetails = { vehicleType: VehicleType; mobility: Mobility; destination: Destination; companion: boolean };
export type AmbulanceRequest = ServiceRequest<AmbulanceRequestDetails>;

/** Which vehicles can carry which patient. A stretcher needs a vehicle with a stretcher. */
export const VEHICLE_FITS: Record<Mobility, readonly VehicleType[]> = {
  walks: VEHICLE_TYPES,
  wheelchair: ["patient_transport", "wheelchair_van", "basic_life_support"],
  stretcher: ["patient_transport", "basic_life_support"],
};
