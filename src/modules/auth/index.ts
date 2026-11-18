import { getAdapterMode } from "@/lib/api/mode";
import type { AuthApi } from "./api";
import { createFixtureAuthApi } from "./fixture";
import type { FixtureOptions } from "./fixture-guard";
import { createHttpAuthApi } from "./http";
import type { HttpAdapterOptions } from "./http-client";
import type { FixtureScenario } from "@/fixtures/identity";

export type AdapterFactoryOptions = {
  env?: Record<string, string | undefined>;
  http?: HttpAdapterOptions;
  fixture?: Omit<FixtureOptions, "env"> & { scenario?: FixtureScenario };
};

/** AuthApi for the configured adapter mode. Throws if fixture is requested in production. */
export function getAuthApi(options: AdapterFactoryOptions = {}): AuthApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture"
    ? createFixtureAuthApi({ ...options.fixture, env })
    : createHttpAuthApi(options.http);
}

export type { AuthApi } from "./api";
export * from "./roles";
export * from "./types";
export * from "./schemas";
export { safeRedirect, normalizeInternalPath } from "./redirect";
export * from "./routes";
