import { getAdapterMode } from "@/lib/api/mode";
import type { AmbulanceApi } from "./api";
import { createAmbulanceFixtureApi, type AmbulanceFixtureOptions } from "./fixture";
import { createAmbulanceHttpApi } from "./http";

export type { AmbulanceApi, TripQueue } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";
export * from "./emergency";

/** Returns the ambulance API for the current adapter mode. Fixture is refused in production. */
export function getAmbulanceApi(options: AmbulanceFixtureOptions = {}): AmbulanceApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createAmbulanceFixtureApi({ ...options, env }) : createAmbulanceHttpApi(env);
}
