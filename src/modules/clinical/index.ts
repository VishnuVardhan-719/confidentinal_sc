import { getAdapterMode } from "@/lib/api/mode";
import { NO_ACTOR } from "@/fixtures/clinical/world";
import type { ApiContext } from "./context";
import { NO_SESSION_HTTP } from "./http-util";
import type { ClinicalApi } from "./api";
import { createClinicalFixtureApi } from "./fixture";
import { gateAll } from "./gate";
import { createClinicalHttpApi } from "./http";

export type { ClinicalApi } from "./api";
export * from "./schemas";
export * from "./types";
export * from "./draft-machine";
export * from "./status";
export * from "./status-core";
export { clinicalGate, isClinicalEnabled } from "./gate";
export type { ApiContext } from "./context";
export { appOrigin, NO_SESSION_HTTP, parseRetryAfter, type HttpOptions } from "./http-util";
export { pdfLinkState, type PdfLinkState } from "./pdf";
export * from "./editor";
export * from "./conflict";
export * from "./autosave";
export * from "./finalize-flow";
export * from "./loaders";
// The React hook lives in ./use-draft-autosave ("use client"); import it directly from client components.

type Env = Record<string, string | undefined>;

/**
 * Clinician consultation API. Every method returns fail("gated") unless FEATURE_CLINICAL=true.
 * Adapter mode is resolved first so fixture-in-production always throws, gate or not.
 */
export function getClinicalApi(env: Env = process.env, ctx: ApiContext = {}): ClinicalApi {
  const api =
    getAdapterMode(env) === "fixture"
      ? createClinicalFixtureApi({ env, actor: ctx.fixtureActor ?? NO_ACTOR })
      : createClinicalHttpApi(ctx.http ?? NO_SESSION_HTTP);
  return gateAll(api, env);
}
