import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
import { filtersSchema } from "./filters";
import type { ProvidersApi } from "./api";

export type ProviderScenario = "available" | "pending" | "suspended" | "empty";
export function createProvidersFixtureApi(options: { env?: FixtureEnvironment; scenario?: ProviderScenario } = {}): ProvidersApi {
  const guard = fixtureGuard(options.env);
  return {
    async list(input) {
      guard();
      const parsed = filtersSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const row = syntheticProvider(parsed.data.category);
      const eligible = (!options.scenario || options.scenario === "available") && parsed.data.pin === row.pin && (parsed.data.priceMax === undefined || row.amountPaise <= parsed.data.priceMax) && !parsed.data.cursor;
      return ok({ items: eligible ? [row] : [], nextCursor: null, synthetic: true });
    },
    async get(id, scope) {
      guard();
      if (!z.uuid().safeParse(id).success) return fail("validation");
      const parsed = filtersSchema.safeParse(scope);
      if (!parsed.success) return fail("validation");
      const row = syntheticProvider(parsed.data.category);
      return (!options.scenario || options.scenario === "available") && row.id === id && row.pin === parsed.data.pin
        ? ok({ items: [row], synthetic: true }) : fail("not_found");
    },
  };
}
