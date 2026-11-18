import { getAdapterMode } from "@/lib/api/mode";
import type { AdapterFactoryOptions } from "@/modules/auth";
import type { VerificationApi } from "./api";
import { createFixtureVerificationApi } from "./fixture";
import { createHttpVerificationApi } from "./http";

/** VerificationApi for the configured adapter mode. Throws if fixture is requested in production. */
export function getVerificationApi(options: Omit<AdapterFactoryOptions, "fixture"> & { fixture?: { now?: () => Date } } = {}): VerificationApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture"
    ? createFixtureVerificationApi({ ...options.fixture, env })
    : createHttpVerificationApi(options.http);
}

export type { VerificationApi } from "./api";
export * from "./status";
export * from "./schemas";
