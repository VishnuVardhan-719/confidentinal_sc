import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import { createServiceRequestsFixtureApi, type RequestStore } from "@/modules/service-requests/fixture-engine";
import type { LabOrdersApi } from "./api";
import { labLines } from "./pricing";
import { labOrderInputSchema } from "./schemas";
import type { LabOrderDetails, LabProvider } from "./types";

const lab = (n: number) => `00000000-0000-4000-8200-${String(n).padStart(12, "0")}`;
const test = (n: number) => `00000000-0000-4000-8201-${String(n).padStart(12, "0")}`;

/** Fictional labs and tests for development. Prices are synthetic, set "by the lab", in integer paise. */
export const SYNTHETIC_LABS: readonly LabProvider[] = [
  {
    id: lab(1), category: "lab", name: "Synthetic lab 1", synthetic: true, collectionFeePaise: 10000, collectionOptions: ["home", "walk_in"],
    area: { locality: "Synthetic locality A", city: "Hyderabad", pins: ["500001", "500002", "500032"] },
    tests: [
      { id: test(1), name: "Complete blood count", specimen: "blood", preparation: "none", pricePaise: 35000, reportHours: 24 },
      { id: test(2), name: "Fasting blood sugar", specimen: "blood", preparation: "fasting_10h", pricePaise: 15000, reportHours: 12 },
      { id: test(3), name: "Thyroid profile (T3, T4, TSH)", specimen: "blood", preparation: "none", pricePaise: 55000, reportHours: 24 },
      { id: test(4), name: "Urine routine", specimen: "urine", preparation: "morning_sample", pricePaise: 20000, reportHours: 12 },
    ],
  },
  {
    id: lab(2), category: "lab", name: "Synthetic lab 2", synthetic: true, collectionFeePaise: 0, collectionOptions: ["home"],
    area: { locality: "Synthetic locality D", city: "Secunderabad", pins: ["500001", "500003"] },
    tests: [
      { id: test(11), name: "Complete blood count", specimen: "blood", preparation: "none", pricePaise: 30000, reportHours: 24 },
      { id: test(12), name: "Lipid profile", specimen: "blood", preparation: "fasting_10h", pricePaise: 60000, reportHours: 24 },
    ],
  },
  {
    id: lab(3), category: "lab", name: "Synthetic lab 3", synthetic: true, collectionFeePaise: 15000, collectionOptions: ["home", "walk_in"],
    area: { locality: "Synthetic locality C", city: "Hyderabad", pins: ["500081"] },
    tests: [{ id: test(21), name: "Vitamin D", specimen: "blood", preparation: "none", pricePaise: 120000, reportHours: 48 }],
  },
];
/** "Synthetic lab 2" declines every order (the decline journey). */
export const SYNTHETIC_DECLINING_LAB_ID = lab(2);
/** Home collection windows (India time). */
export const LAB_COLLECTION_TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00"] as const;

export function createLabOrdersFixtureApi(options: { env?: FixtureEnvironment; patient: PatientApi; now?: () => Date; store?: RequestStore<LabOrderDetails> }): LabOrdersApi {
  return createServiceRequestsFixtureApi({
    category: "lab", providers: SYNTHETIC_LABS, decliningProviderId: SYNTHETIC_DECLINING_LAB_ID,
    slotTimes: LAB_COLLECTION_TIMES, slotMinutes: 60, schema: labOrderInputSchema,
    durationMinutes: () => 60,
    price: (provider, input) => labLines(provider, input.testIds),
    details: (provider, input) => ({
      collection: "home",
      tests: input.testIds.map(id => provider.tests.find(item => item.id === id.toLowerCase())!).map(({ id, name, specimen, preparation }) => ({ id, name, specimen, preparation })),
    }),
  }, options);
}
