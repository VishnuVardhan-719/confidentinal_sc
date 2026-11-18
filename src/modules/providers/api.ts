import type { ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { ProviderDetail, ProviderPage } from "./schemas";
import type { ProviderFilters } from "./filters";
import { createProvidersHttpApi } from "./http";
import { createProvidersFixtureApi } from "./fixture";

export interface ProvidersApi {
  list(filters: ProviderFilters, options?: { signal?: AbortSignal }): Promise<ApiResult<ProviderPage>>;
  get(id: string, scope: Pick<ProviderFilters, "category" | "pin">): Promise<ApiResult<ProviderDetail>>;
}
export function createProvidersApi(env?: FixtureEnvironment): ProvidersApi {
  return getAdapterMode(env) === "fixture" ? createProvidersFixtureApi({ env }) : createProvidersHttpApi();
}
