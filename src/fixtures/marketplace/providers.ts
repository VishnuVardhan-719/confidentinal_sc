import type { PublicProvider } from "@/modules/providers/schemas";
import type { Category } from "@/modules/catalog/schemas";

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
