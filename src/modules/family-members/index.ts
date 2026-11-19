import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureActor } from "@/fixtures/clinical/world";
import type { FamilyMembersApi } from "./api";
import { createFamilyMembersFixtureApi } from "./fixture";
import { createFamilyMembersHttpApi } from "./http";

export type { FamilyMembersApi } from "./api";
export * from "./types";
export * from "./schemas";

type Env = Record<string, string | undefined>;

/**
 * Family members API for the signed-in patient. Fixture mode (never production) scopes the synthetic
 * store to the fixture actor; FIXTURE_FAMILY_SCENARIO=empty (server env) starts it empty.
 */
export function getFamilyMembersApi(env: Env = process.env, actor: FixtureActor | null = null): FamilyMembersApi {
  if (getAdapterMode(env) !== "fixture") return createFamilyMembersHttpApi();
  return createFamilyMembersFixtureApi({
    env,
    ownerId: actor?.role === "patient" ? actor.patientId : null,
    scenario: env.FIXTURE_FAMILY_SCENARIO === "empty" ? "empty" : "seeded",
  });
}
