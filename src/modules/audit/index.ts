import { getAdapterMode } from "@/lib/api/mode";
import type { AuditApi } from "./api";
import { createAuditFixtureApi, type AuditFixtureOptions } from "./fixture";
import { createAuditHttpApi } from "./http";

export type { AuditApi } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";

/** Audit API for the current adapter mode. Fixture is refused in production. */
export function getAuditApi(options: AuditFixtureOptions = {}): AuditApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createAuditFixtureApi({ ...options, env }) : createAuditHttpApi();
}
