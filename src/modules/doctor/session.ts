import { cookies } from "next/headers";
import { fixtureActorFor, isLoginRedirect } from "@/modules/auth/fixture-actors";
import type { GuardOutcome } from "@/modules/auth/guard";
import type { Locale } from "@/modules/auth/roles";
import { authorizeRole, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { readAccessToken } from "@/modules/auth/session-cookie";
import type { ApiContext } from "@/modules/clinical/context";
import type { HttpOptions } from "@/modules/clinical/http-util";
import type { GuardResult } from "./routing";

export type DoctorSession = {
  guard: GuardResult;
  /** Per-request API wiring; only meaningful when guard.status === "ok". */
  ctx: ApiContext;
  /** True when the data on screen comes from the synthetic fixture adapter. */
  synthetic: boolean;
};

/** Allowed doctor -> per-request wiring. Pure; exported for unit tests. */
export function doctorSessionFrom(outcome: GuardOutcome, fixture: boolean, http?: HttpOptions): DoctorSession {
  if (outcome.kind !== "allowed") {
    return { guard: isLoginRedirect(outcome) ? { status: "unauthenticated" } : { status: "forbidden" }, ctx: {}, synthetic: fixture };
  }
  if (!fixture) return { guard: { status: "ok" }, ctx: http ? { http } : {}, synthetic: false };
  const actor = fixtureActorFor(outcome.identity, "doctor");
  // A synthetic identity with no clinical-world doctor gets no actor: fixture adapters deny everything.
  return { guard: { status: "ok" }, ctx: actor ? { fixtureActor: actor } : {}, synthetic: true };
}

/**
 * Doctor session for the layout and SERVER ACTIONS, on fe-b `authorizeRole("doctor")` (never
 * redirects; anything but allowed is refused). Pages use `requireDoctorSession` (redirects).
 * http mode: the clinical http adapters read the bearer token from the session cookie themselves.
 */
export async function getDoctorSession(): Promise<DoctorSession> {
  return doctorSessionFrom(await authorizeRole("doctor", { locale: "en" }), isFixtureAdapter(), sessionHttp());
}

/**
 * Doctor session for PAGES, on fe-b `requireRole("doctor")`: signed out -> login with `path`;
 * incomplete workspace -> onboarding; wrong role -> own landing. Workspace exists but is not
 * usable -> denied ("restricted" for a restricted account, otherwise "forbidden").
 */
export async function requireDoctorSession(locale: Locale, path: string): Promise<{ ok: true; session: DoctorSession } | { ok: false; reason: "forbidden" | "restricted" }> {
  const access = await requireRole("doctor", { locale, path });
  if (access.kind === "denied") return { ok: false, reason: access.reason === "account_restricted" ? "restricted" : "forbidden" };
  return { ok: true, session: doctorSessionFrom(access, isFixtureAdapter(), sessionHttp()) };
}
/** Bearer token from the httpOnly session cookie, read per call; origin from APP_ORIGIN only. */
function sessionHttp(): HttpOptions {
  const raw = process.env.APP_ORIGIN;
  let baseUrl: string | undefined;
  try {
    baseUrl = raw ? new URL(raw).origin : undefined;
  } catch {
    baseUrl = undefined;
  }
  return { getAccessToken: async () => readAccessToken(await cookies()), ...(baseUrl ? { baseUrl } : {}) };
}