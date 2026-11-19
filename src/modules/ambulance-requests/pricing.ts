import type { RequestLine } from "@/modules/service-requests/core";
import type { AmbulanceProvider, VehicleType } from "./types";

/**
 * The operator's fixed fare for a scheduled transfer inside its service area, by vehicle type, in integer paise.
 * No distance-based estimate is made: there is no approved distance or quote contract yet.
 */
export function ambulanceLines(provider: Pick<AmbulanceProvider, "vehicles">, vehicleType: VehicleType): RequestLine[] | "validation" {
  const vehicle = provider.vehicles.find(item => item.type === vehicleType);
  if (!vehicle) return "validation";
  return [{ key: `vehicle:${vehicle.type}`, label: "Scheduled transfer", quantity: 1, unitPaise: vehicle.farePaise, amountPaise: vehicle.farePaise }];
}
