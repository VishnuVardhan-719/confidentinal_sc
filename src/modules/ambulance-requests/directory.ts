import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import { createPublicProviderDirectoryFixtureApi, createPublicProviderDirectoryHttpApi, type PublicProviderDirectoryApi } from "@/modules/service-requests/public-directory";
import type { AmbulanceProvider } from "./types";

export type AmbulanceDirectoryApi = PublicProviderDirectoryApi<AmbulanceProvider>;

/** Server-only factory for the public operator list. Fixture data is refused in production by the fixture guard. */
export async function createAmbulanceDirectoryApi(env: FixtureEnvironment = process.env): Promise<AmbulanceDirectoryApi> {
  if (getAdapterMode(env) !== "fixture") return createPublicProviderDirectoryHttpApi<AmbulanceProvider>();
  const { SYNTHETIC_AMBULANCE_OPERATORS } = await import("./fixture");
  return createPublicProviderDirectoryFixtureApi(SYNTHETIC_AMBULANCE_OPERATORS, env);
}
