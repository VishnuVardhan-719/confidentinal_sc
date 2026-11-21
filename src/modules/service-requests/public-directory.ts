import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { providerFilterSchema, type BaseProvider, type ProviderFilter } from "./core";

/**
 * Public, read-only provider directory for the non-doctor services that have no search of their own
 * (scheduled ambulance transfers and caretakers). No sign-in. Only fields the provider listing already
 * carries: name, service area (locality, city, served PINs) and the service's own catalogue and price. No
 * phone, address, staff or document data. The fixture reads the same synthetic providers a patient can request
 * at /patient/{ambulance,caretakers}. docs/API_CONTRACTS.md has no public provider read yet, so the HTTP
 * adapter fails closed with `gated` (proposed in docs/frontend/REQUESTS.md).
 */
export interface PublicProviderDirectoryApi<P extends BaseProvider> {
  list(filter: ProviderFilter): Promise<ApiResult<{ items: P[]; synthetic: boolean }>>;
  get(id: string): Promise<ApiResult<{ provider: P; synthetic: boolean }>>;
}

export function createPublicProviderDirectoryFixtureApi<P extends BaseProvider>(providers: readonly P[], env?: FixtureEnvironment): PublicProviderDirectoryApi<P> {
  const guard = fixtureGuard(env);
  return {
    async list(filter) {
      guard();
      const parsed = providerFilterSchema.safeParse(filter ?? {});
      if (!parsed.success) return fail("validation");
      const { pin } = parsed.data;
      return ok({ items: structuredClone(providers.filter(provider => !pin || provider.area.pins.includes(pin))) as P[], synthetic: true });
    },
    async get(id) {
      guard();
      if (!z.uuid().safeParse(id).success) return fail("not_found");
      const provider = providers.find(item => item.id === id.toLowerCase());
      return provider ? ok({ provider: structuredClone(provider) as P, synthetic: true }) : fail("not_found");
    },
  };
}

export function createPublicProviderDirectoryHttpApi<P extends BaseProvider>(): PublicProviderDirectoryApi<P> {
  return {
    async list(filter) { return fail(providerFilterSchema.safeParse(filter ?? {}).success ? "gated" : "validation"); },
    async get(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "not_found"); },
  };
}
