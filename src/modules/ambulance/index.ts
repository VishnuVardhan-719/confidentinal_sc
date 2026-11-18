import { getAdapterMode } from "@/lib/api/mode";
import type { AmbulanceApi } from "./api";
import { createAmbulanceFixtureApi, createAmbulanceFixtureStore, type AmbulanceFixtureOptions, type AmbulanceFixtureStore } from "./fixture";
import { createAmbulanceHttpApi } from "./http";

export type { AmbulanceApi, TripQueue } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";
export * from "./emergency";

/** Returns the ambulance API for the current adapter mode. Fixture is refused in production. */
let sharedStore: AmbulanceFixtureStore | undefined;

export function getAmbulanceApi(options: AmbulanceFixtureOptions = {}): AmbulanceApi {
  const env = options.env ?? process.env;
  if (getAdapterMode(env) !== "fixture") return createAmbulanceHttpApi(env);
  return createAmbulanceFixtureApi({ ...options, env, store: options.store ?? (sharedStore ??= createAmbulanceFixtureStore()) });
}
