import { getAdapterMode } from "@/lib/api/mode";
import type { AdminApi } from "./api";
import { createAdminFixtureApi, type AdminFixtureOptions } from "./fixture";
import { createAdminHttpApi, type AdminHttpOptions } from "./http";

export type { AdminApi } from "./api";
export * from "./capabilities";
export * from "./types";
export * from "./rules";
export * from "./status";

export type GetAdminApiOptions = AdminFixtureOptions & { http?: AdminHttpOptions };

/** Returns the admin API for the current adapter mode. Fixture is refused in production. */
export function getAdminApi(options: GetAdminApiOptions = {}): AdminApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture"
    ? createAdminFixtureApi({ ...options, env })
    : createAdminHttpApi({ ...options.http, env });
}
