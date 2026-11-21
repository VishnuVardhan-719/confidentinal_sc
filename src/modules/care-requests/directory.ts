import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import { createPublicProviderDirectoryFixtureApi, createPublicProviderDirectoryHttpApi, type PublicProviderDirectoryApi } from "@/modules/service-requests/public-directory";
import type { CareProvider } from "./types";

export type CareDirectoryApi = PublicProviderDirectoryApi<CareProvider>;

/** Server-only factory for the public caretaker list. Fixture data is refused in production by the fixture guard. */
export async function createCareDirectoryApi(env: FixtureEnvironment = process.env): Promise<CareDirectoryApi> {
  if (getAdapterMode(env) !== "fixture") return createPublicProviderDirectoryHttpApi<CareProvider>();
  const { SYNTHETIC_CARETAKERS } = await import("./fixture");
  return createPublicProviderDirectoryFixtureApi(SYNTHETIC_CARETAKERS, env);
}
