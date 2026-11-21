import { getAdapterMode } from "@/lib/api/mode";
import { sessionBearerHeaders } from "@/modules/auth/session-token";
import type { AdminApi } from "./api";
import { createAdminFixtureApi, createAdminFixtureStore, type AdminFixtureOptions, type AdminFixtureStore } from "./fixture";
import { createAdminHttpApi, type AdminHttpOptions } from "./http";

export type { AdminApi } from "./api";
export * from "./capabilities";
export * from "./types";
export * from "./rules";
export * from "./status";

export type GetAdminApiOptions = AdminFixtureOptions & { http?: AdminHttpOptions };

/** Returns the admin API for the current adapter mode. Fixture is refused in production. */
let sharedStore: AdminFixtureStore | undefined;

export function getAdminApi(options: GetAdminApiOptions = {}): AdminApi {
  const env = options.env ?? process.env;
  if (getAdapterMode(env) !== "fixture") return createAdminHttpApi({ headers: sessionBearerHeaders, ...options.http, env });
  return createAdminFixtureApi({ ...options, env, store: options.store ?? (sharedStore ??= createAdminFixtureStore()) });
}
