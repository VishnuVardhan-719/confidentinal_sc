import { fail, ok, type ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import { connection } from "next/server";
import type { FixtureActor } from "@/fixtures/clinical/world";
import { fixtureActorFor } from "@/modules/auth/fixture-actors";
import type { DeniedReason, GuardOutcome } from "@/modules/auth/guard";
import { authorizeRole, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { createBookingsApi, type BookingsApi } from "@/modules/bookings/api";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";

type Env = Record<string, string | undefined>;

export type PatientSession =
  | { status: "ok"; synthetic: boolean; fixtureActor: FixtureActor | null }
  | { status: "unauthenticated" };

export type PatientPageSession = Extract<PatientSession, { status: "ok" }> | { status: "denied"; reason: DeniedReason };

/** Allowed patient -> session view. Pure; exported for unit tests. */
export function patientSessionFrom(outcome: GuardOutcome, fixture: boolean): PatientSession {
  if (outcome.kind !== "allowed") return { status: "unauthenticated" };
  return { status: "ok", synthetic: fixture, fixtureActor: fixture ? fixtureActorFor(outcome.identity, "patient") : null };
}

/**
 * Patient session for SERVER ACTIONS and per-operation re-checks, on fe-b `authorizeRole("patient")`.
 * Never redirects; anything other than an allowed, usable patient workspace is "unauthenticated"
 * (refused). The module adapters and the backend still authorize every read and write.
 */
export async function getPatientSession(): Promise<PatientSession> {
  await connection();
  return patientSessionFrom(await authorizeRole("patient", { locale: "en" }), isFixtureAdapter());
}

/**
 * Patient session for PAGES, on fe-b `requireRole("patient")`: signed out -> login with `path` as
 * the return path; onboarding incomplete -> onboarding; wrong role -> the user's own landing.
 * A workspace that exists but cannot be used (or an unavailable session lookup) is `denied`;
 * pages render <AccessDenied reason/>. Pass a path without record or booking IDs when the ID
 * must not travel through the login URL.
 */
export async function requirePatientSession(locale: string, path: string): Promise<PatientPageSession> {
  await connection();
  const loc = locale === "te" || locale === "hi" ? locale : "en";
  const access = await requireRole("patient", { locale: loc, path });
  if (access.kind === "denied") return { status: "denied", reason: access.reason };
  const s = patientSessionFrom(access, isFixtureAdapter());
  return s.status === "ok" ? s : { status: "denied", reason: "forbidden" };
}

/** Per-operation re-check for the bookings loaders (they authorize on every call). */
export function authorizerFor(): () => Promise<ApiResult<null>> {
  return async () => ((await getPatientSession()).status === "ok" ? ok(null) : fail("unauthenticated"));
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
