import type { PublicProvider } from "@/modules/providers/schemas";
import type { Category } from "@/modules/catalog/schemas";
import { SYNTHETIC_DOCTORS } from "./doctors";

export type SyntheticBookable = Pick<PublicProvider, "id" | "serviceId" | "category" | "pin" | "amountPaise" | "durationMinutes" | "termsVersion" | "unit">;
/** Every synthetic service a fixture booking may reference: the four category rows plus synthetic doctors with a location. */
export function syntheticBookable(serviceId: string): SyntheticBookable | undefined {
  const id = serviceId.toLowerCase();
  const row = (["doctor", "lab", "ambulance", "caretaker"] as const).map(category => syntheticProvider(category)).find(item => item.serviceId === id);
  if (row) return row;
  const doctor = SYNTHETIC_DOCTORS.find(item => item.serviceId === id && item.location !== null);
  return doctor && doctor.location ? { id: doctor.providerId, serviceId: doctor.serviceId, category: "doctor", pin: doctor.location.pin,
    amountPaise: doctor.feePaise, durationMinutes: 60, termsVersion: "synthetic-not-approved", unit: "visit" } : undefined;
}

/** Fictional development records, never claims about actual providers or coverage. */
export function syntheticProvider(category: Category, index = { doctor: 1, lab: 2, ambulance: 3, caretaker: 4 }[category]): PublicProvider {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`, serviceId: `00000000-0000-4000-8001-${suffix}`,
    category, displayName: `Synthetic ${category} provider`, serviceTitle: `Synthetic ${category} service`,
    durationMinutes: 60, amountPaise: 50000, currency: "INR", unit: category === "lab" ? "test" : category === "ambulance" ? "trip" : category === "caretaker" ? "hour" : "visit",
    termsVersion: "synthetic-not-approved", pin: "500001", city: "Synthetic city", availability: "advisory_only", synthetic: true,
  };
}
