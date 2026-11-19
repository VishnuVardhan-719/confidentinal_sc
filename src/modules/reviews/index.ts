import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureActor } from "@/fixtures/clinical/world";
import type { ReviewsApi } from "./api";
import { createReviewsFixtureApi } from "./fixture";
import { createReviewsHttpApi } from "./http";

export type { ReviewsApi } from "./api";
export * from "./types";
export * from "./schemas";
export * from "./status";

type Env = Record<string, string | undefined>;

/** Reviews for the signed-in patient. FIXTURE_REVIEWS_SCENARIO=empty (server env) starts with no visits. */
export function getReviewsApi(env: Env = process.env, actor: FixtureActor | null = null): ReviewsApi {
  if (getAdapterMode(env) !== "fixture") return createReviewsHttpApi();
  return createReviewsFixtureApi({
    env,
    ownerId: actor?.role === "patient" ? actor.patientId : null,
    scenario: env.FIXTURE_REVIEWS_SCENARIO === "empty" ? "empty" : "seeded",
  });
}
