import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureActor } from "@/fixtures/clinical/world";
import type { SavedProvidersApi } from "./api";
import { createSavedProvidersFixtureApi } from "./fixture";
import { createSavedProvidersHttpApi } from "./http";

export type { SavedProvidersApi } from "./api";
export * from "./types";
export * from "./schemas";

type Env = Record<string, string | undefined>;

/** Saved doctors for the signed-in patient. FIXTURE_SAVED_SCENARIO=empty (server env) starts empty. */
export function getSavedProvidersApi(env: Env = process.env, actor: FixtureActor | null = null): SavedProvidersApi {
  if (getAdapterMode(env) !== "fixture") return createSavedProvidersHttpApi();
  return createSavedProvidersFixtureApi({
    env,
    ownerId: actor?.role === "patient" ? actor.patientId : null,
    scenario: env.FIXTURE_SAVED_SCENARIO === "empty" ? "empty" : "seeded",
  });
}
