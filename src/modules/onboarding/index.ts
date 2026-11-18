import { getAdapterMode } from "@/lib/api/mode";
import type { AdapterFactoryOptions } from "@/modules/auth";
import type { OnboardingApi } from "./api";
import { createFixtureOnboardingApi, type OnboardingFixtureOptions } from "./fixture";
import { createHttpOnboardingApi } from "./http";

/** OnboardingApi for the configured adapter mode. Throws if fixture is requested in production. */
export function getOnboardingApi(
  options: Omit<AdapterFactoryOptions, "fixture"> & { fixture?: Omit<OnboardingFixtureOptions, "env"> } = {},
): OnboardingApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture"
    ? createFixtureOnboardingApi({ ...options.fixture, env })
    : createHttpOnboardingApi(options.http);
}

export type { OnboardingApi, CreateProviderInput, RegisterDocumentInput, DocumentUploadTicket, ProviderMutationResult } from "./api";
export * from "./patient";
export * from "./provider";
export * from "./steps";
export * from "./shared";
export * from "./readiness";
export * from "./visibility";
