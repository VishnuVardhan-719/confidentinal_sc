import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import { createServiceRequestsFixtureApi, type RequestStore } from "@/modules/service-requests/fixture-engine";
import type { CareRequestsApi } from "./api";
import { careLines } from "./pricing";
import { careRequestInputSchema } from "./schemas";
import type { CareProvider, CareRequestDetails } from "./types";

const id = (n: number) => `00000000-0000-4000-8300-${String(n).padStart(12, "0")}`;

/** Fictional caretakers and agencies for development. Hourly rates are synthetic, set "by the provider", in paise. */
export const SYNTHETIC_CARETAKERS: readonly CareProvider[] = [
  { id: id(1), category: "caretaker", name: "Synthetic caretaker 1", kind: "independent", synthetic: true, languages: ["en", "te"],
    area: { locality: "Synthetic locality A", city: "Hyderabad", pins: ["500001", "500002"] },
    tasks: ["companionship", "mobility_help", "meal_help", "medicine_reminder"], hourlyRatePaise: 25000, minHours: 2, maxHours: 8 },
  { id: id(2), category: "caretaker", name: "Synthetic care agency 2", kind: "agency", synthetic: true, languages: ["en", "hi"],
    area: { locality: "Synthetic locality B", city: "Hyderabad", pins: ["500001", "500032"] },
    tasks: ["companionship", "personal_care", "meal_help"], hourlyRatePaise: 30000, minHours: 4, maxHours: 12 },
  { id: id(3), category: "caretaker", name: "Synthetic caretaker 3", kind: "independent", synthetic: true, languages: ["te"],
    area: { locality: "Synthetic locality C", city: "Hyderabad", pins: ["500081"] },
    tasks: ["companionship"], hourlyRatePaise: 20000, minHours: 2, maxHours: 6 },
];
/** "Synthetic care agency 2" declines every request (the decline journey). */
export const SYNTHETIC_DECLINING_CARETAKER_ID = id(2);
export const CARE_START_TIMES = ["08:00", "10:00", "14:00", "18:00"] as const;

export function createCareRequestsFixtureApi(options: { env?: FixtureEnvironment; patient: PatientApi; now?: () => Date; store?: RequestStore<CareRequestDetails> }): CareRequestsApi {
  return createServiceRequestsFixtureApi({
    category: "caretaker", providers: SYNTHETIC_CARETAKERS, decliningProviderId: SYNTHETIC_DECLINING_CARETAKER_ID,
    slotTimes: CARE_START_TIMES, slotMinutes: 120, schema: careRequestInputSchema,
    durationMinutes: input => input.hours * 60,
    price: (provider, input) => careLines(provider, input.hours),
    // Only tasks this provider offers; nothing clinical is ever accepted.
    check: (provider, input) => (input.tasks.every(task => provider.tasks.includes(task)) ? null : "validation"),
    details: (provider, input) => ({ kind: provider.kind, tasks: [...input.tasks], hours: input.hours }),
  }, options);
}
