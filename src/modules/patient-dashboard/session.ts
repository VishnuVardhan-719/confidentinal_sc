import { fail, ok, type ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import { assertFixtureAllowed, DEFAULT_PATIENT_ACTOR, type FixtureActor } from "@/fixtures/clinical/world";
import { createBookingsApi, type BookingsApi } from "@/modules/bookings/api";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";

type Env = Record<string, string | undefined>;

export type PatientSession =
  | { status: "ok"; synthetic: boolean; fixtureActor: FixtureActor | null }
  | { status: "unauthenticated" };

/**
 * INTERIM patient session (server-only), same model as modules/doctor/session.ts.
 * - http mode: fe2-b requireRole("patient") is not on this branch, so every request is
 *   unauthenticated and redirected to login. Fails closed; never fakes a session.
 * - fixture mode (never production): FIXTURE_PATIENT_SESSION=self, a SERVER env var (not a cookie,
 *   URL or user choice). Unset = unauthenticated.
 * Replace with requireRole("patient") when fe2-b merges (docs/frontend/REQUESTS.md R-FE-D-31).
 */
export function getPatientSession(env: Env = process.env): PatientSession {
  if (getAdapterMode(env) !== "fixture") return { status: "unauthenticated" };
  assertFixtureAllowed(env);
  if (env.FIXTURE_PATIENT_SESSION !== "self") return { status: "unauthenticated" };
  return { status: "ok", synthetic: true, fixtureActor: DEFAULT_PATIENT_ACTOR };
}

/** Per-operation re-check for the bookings loaders (they authorize on every call). */
export function authorizerFor(env: Env = process.env): () => Promise<ApiResult<null>> {
  return async () => (getPatientSession(env).status === "ok" ? ok(null) : fail("unauthenticated"));
}

const SAFE_NEXT = /^\/(en|te|hi)\/patient(\/[a-z0-9-]+)*$/;

const BOOKING_SCENARIOS = ["empty", "requested", "accepted", "declined", "cancelled", "cancel_window"] as const;

/**
 * Bookings API for the dashboard. In fixture mode the fe2-c fixture seeds no bookings unless a
 * scenario is chosen; FIXTURE_BOOKING_SCENARIO (server env, never user input) picks one so the
 * synthetic dashboard can be reviewed. http mode is unchanged.
 */
export function dashboardBookingsApi(env: Env = process.env): BookingsApi {
  if (getAdapterMode(env) !== "fixture") return createBookingsApi(env);
  const scenario = BOOKING_SCENARIOS.find((s) => s === env.FIXTURE_BOOKING_SCENARIO);
  return createBookingsFixtureApi({ env, scenario });
}

export function patientLoginRedirect(locale: string, path: string): string {
  const loc = locale === "te" || locale === "hi" ? locale : "en";
  const next = SAFE_NEXT.test(path) ? path : `/${loc}/patient/dashboard`;
  return `/${loc}/login?next=${encodeURIComponent(next)}`;
}
