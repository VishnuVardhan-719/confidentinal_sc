import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureActor } from "@/fixtures/clinical/world";
import type { ReviewModerationApi, ReviewsApi } from "./api";
import { createReviewModerationFixtureApi, createReviewsFixtureApi } from "./fixture";
import { createReviewModerationHttpApi, createReviewsHttpApi } from "./http";

export type { ReviewModerationApi, ReviewsApi } from "./api";
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

/**
 * Moderation API. `moderator` must come from the server-side admin principal (capability
 * `review:moderate`); the adapter refuses everyone else, and the backend re-checks. `actorId` is the
 * principal's profile id: decisions are attributed to it and the log marks the caller's own rows.
 */
export function getReviewModerationApi(env: Env = process.env, moderator = false, actorId: string | null = null): ReviewModerationApi {
  if (getAdapterMode(env) !== "fixture") return createReviewModerationHttpApi();
  return createReviewModerationFixtureApi({ env, moderator, actorId });
}