import { getAdapterMode } from "@/lib/api/mode";
import type { LabApi } from "./api";
import { createLabFixtureApi, type LabFixtureOptions } from "./fixture";
import { createLabHttpApi } from "./http";

export type { LabApi, LabOrderQueue } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";

/**
 * Returns the lab API for the current adapter mode. Throws when fixture mode
 * is requested with APP_ENV=production (see getAdapterMode).
 */
export function getLabApi(options: LabFixtureOptions = {}): LabApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createLabFixtureApi({ ...options, env }) : createLabHttpApi();
}
