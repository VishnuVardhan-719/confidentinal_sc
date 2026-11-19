import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import { createServiceRequestsFixtureApi, type RequestStore } from "@/modules/service-requests/fixture-engine";
import type { AmbulanceRequestsApi } from "./api";
import { ambulanceLines } from "./pricing";
import { ambulanceRequestInputSchema } from "./schemas";
import type { AmbulanceProvider, AmbulanceRequestDetails } from "./types";

const id = (n: number) => `00000000-0000-4000-8400-${String(n).padStart(12, "0")}`;

/** Fictional operators for development. Fares are synthetic, set "by the operator", in integer paise. */
export const SYNTHETIC_AMBULANCE_OPERATORS: readonly AmbulanceProvider[] = [
  { id: id(1), category: "ambulance", name: "Synthetic transfer operator 1", synthetic: true,
    area: { locality: "Synthetic locality A", city: "Hyderabad", pins: ["500001", "500002", "500032"] },
    vehicles: [{ type: "patient_transport", farePaise: 120000 }, { type: "wheelchair_van", farePaise: 90000 }, { type: "basic_life_support", farePaise: 250000 }] },
  { id: id(2), category: "ambulance", name: "Synthetic transfer operator 2", synthetic: true,
    area: { locality: "Synthetic locality D", city: "Secunderabad", pins: ["500001", "500003"] },
    vehicles: [{ type: "patient_transport", farePaise: 110000 }] },
  { id: id(3), category: "ambulance", name: "Synthetic transfer operator 3", synthetic: true,
    area: { locality: "Synthetic locality C", city: "Hyderabad", pins: ["500081"] },
    vehicles: [{ type: "wheelchair_van", farePaise: 80000 }] },
];
/** "Synthetic transfer operator 2" declines every request (the decline journey). */
export const SYNTHETIC_DECLINING_OPERATOR_ID = id(2);
export const PICKUP_TIMES = ["06:00", "09:00", "12:00", "15:00", "18:00"] as const;

export function createAmbulanceRequestsFixtureApi(options: { env?: FixtureEnvironment; patient: PatientApi; now?: () => Date; store?: RequestStore<AmbulanceRequestDetails> }): AmbulanceRequestsApi {
  return createServiceRequestsFixtureApi({
    category: "ambulance", providers: SYNTHETIC_AMBULANCE_OPERATORS, decliningProviderId: SYNTHETIC_DECLINING_OPERATOR_ID,
    slotTimes: PICKUP_TIMES, slotMinutes: 120, schema: ambulanceRequestInputSchema,
    durationMinutes: () => 120,
    price: (provider, input) => ambulanceLines(provider, input.vehicleType),
    // The drop-off must also be inside the operator's area; the fixed fare covers that area only.
    check: (provider, input) => (provider.area.pins.includes(input.destination.pin) ? null : "validation"),
    details: (_provider, input) => ({ vehicleType: input.vehicleType, mobility: input.mobility, destination: { ...input.destination }, companion: input.companion }),
  }, options);
}
