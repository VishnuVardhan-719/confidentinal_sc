import { fail } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import type { ProofCheckApi } from "./api";
import { createProofCheckFixtureApi } from "./fixture";
import { createProofCheckHttpApi } from "./http";

export type { ProofCheckApi } from "./api";
export * from "./types";

type Env = Record<string, string | undefined>;

/**
 * Public proof check. Behind the clinical flag (off unless FEATURE_CLINICAL=true): while off, every
 * check returns fail("gated") without touching an adapter. Fixture mode is synthetic and refused in
 * production; http has no contract yet and is gated.
 */
export function getProofCheckApi(env: Env = process.env): ProofCheckApi {
  if (!isClinicalEnabled(env)) return { check: async () => fail("gated") };
  return getAdapterMode(env) === "fixture" ? createProofCheckFixtureApi({ env }) : createProofCheckHttpApi();
}
