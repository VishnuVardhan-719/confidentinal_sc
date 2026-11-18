import type { FixtureActor } from "@/fixtures/clinical/world";
import type { HttpOptions } from "./http-util";

/**
 * Per-request wiring for the doctor/clinical/records getters. Build it on the server for each
 * request from the signed-in session; never cache it across users.
 *
 * - `http`: origin (appOrigin(env)) and bearer-token lookup from the httpOnly session cookie.
 *   Missing => every HTTP call fails "unauthenticated" without a request.
 * - `fixtureActor`: the synthetic actor mapped from the signed-in FIXTURE session.
 *   Missing => fixture adapter denies everything (no default doctor/patient).
 */
export type ApiContext = {
  http?: HttpOptions;
  fixtureActor?: FixtureActor;
};
