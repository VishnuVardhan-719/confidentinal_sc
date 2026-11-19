import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticBookable } from "@/fixtures/marketplace/providers";
import { SYNTHETIC_POLICY_ID, syntheticAddresses, syntheticMembers, syntheticOverview } from "@/fixtures/marketplace/patient";
import type { PatientApi } from "./api";
import type { SyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { newAddressSchema, offerRequestSchema } from "./schemas";

export type PatientFixtureScenario = "complete" | "questionnaire_incomplete" | "no_addresses";
const INCOMPLETE = ["pinnedLocation", "allergies"] as const;
export function createPatientFixtureApi(options: { env?: FixtureEnvironment; scenario?: PatientFixtureScenario; store?: SyntheticMarketplaceStore } = {}): PatientApi {
  const guard = fixtureGuard(options.env);
  return {
    async getOverview() {
      guard();
      return ok(syntheticOverview(options.scenario === "questionnaire_incomplete" ? INCOMPLETE : []));
    },
    async listMembers() {
      guard();
      return ok({ items: syntheticMembers(options.scenario === "questionnaire_incomplete" ? INCOMPLETE : []) });
    },
    async listAddresses() {
      guard();
      if (options.store) return ok({ items: structuredClone(options.store.addresses) });
      return ok({ items: options.scenario === "no_addresses" ? [] : syntheticAddresses() });
    },
    async addAddress(input) {
      guard();
      const parsed = newAddressSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      if (!options.store) return fail("gated");
      if (options.store.addresses.length >= 10) return fail("conflict");
      const id = crypto.randomUUID();
      options.store.addresses.push({ id, ...parsed.data, synthetic: true });
      return ok({ id });
    },
    async getOffer(input) {
      guard();
      const parsed = offerRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const provider = syntheticBookable(parsed.data.serviceId);
      if (!provider || provider.id !== parsed.data.providerId || provider.category !== parsed.data.category) return fail("not_found");
      if (provider.pin !== parsed.data.pin) return fail("gated");
      // The synthetic booking fixture books exactly one service duration; other lengths would not round-trip.
      if (Date.parse(parsed.data.endAt) - Date.parse(parsed.data.startAt) !== provider.durationMinutes * 60_000) return fail("validation");
      return ok({ providerId: provider.id, serviceId: provider.serviceId, startAt: parsed.data.startAt, endAt: parsed.data.endAt,
        priceSnapshot: { amountPaise: provider.amountPaise, currency: "INR", termsVersion: provider.termsVersion, policyVersionId: SYNTHETIC_POLICY_ID },
        unit: provider.unit, policy: { id: SYNTHETIC_POLICY_ID, version: "synthetic-v1", approved: false, cancelWindowMinutes: 120 },
        noticeVersion: "synthetic-notice-v1", eligibilityVersion: 1, paymentMethods: ["pay_after"], synthetic: true });
    },
  };
}
