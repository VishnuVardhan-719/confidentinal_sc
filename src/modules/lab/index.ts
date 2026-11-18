import { getAdapterMode } from "@/lib/api/mode";
import type { LabApi } from "./api";
import { createLabFixtureApi, createLabFixtureStore, type LabFixtureOptions, type LabFixtureStore } from "./fixture";
import { createLabHttpApi } from "./http";

export type { LabApi, LabOrderQueue } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";

/**
 * Returns the lab API for the current adapter mode. Throws when fixture mode
 * is requested with APP_ENV=production (see getAdapterMode).
 */
let sharedStore: LabFixtureStore | undefined;

export function getLabApi(options: LabFixtureOptions = {}): LabApi {
  const env = options.env ?? process.env;
  if (getAdapterMode(env) !== "fixture") return createLabHttpApi();
  return createLabFixtureApi({ ...options, env, store: options.store ?? (sharedStore ??= createLabFixtureStore()) });
}
