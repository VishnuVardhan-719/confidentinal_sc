import { getAdapterMode } from "@/lib/api/mode";
import { assertFixtureAllowed, FIXTURE_IDS, type FixtureActor } from "@/fixtures/clinical/world";
import type { ApiContext } from "@/modules/clinical/context";
import type { GuardResult } from "./routing";

type Env = Record<string, string | undefined>;

export type DoctorSession = {
  guard: GuardResult;
  /** Per-request API wiring; only meaningful when guard.status === "ok". */
  ctx: ApiContext;
  /** True when the data on screen comes from the synthetic fixture adapter. */
  synthetic: boolean;
};

/**
 * INTERIM session adapter for /[locale]/doctor/** (server-only use).
 *
 * - http mode: the fe2-b auth module (requireRole + session cookie -> bearer token) is not on
 *   this branch yet, so there is no way to read a session here. Every request is treated as
 *   unauthenticated and redirected to login. This fails closed; it never fakes a session.
 * - fixture mode (never production): the synthetic doctor is chosen by the SERVER env var
 *   FIXTURE_DOCTOR_SESSION=assigned|other. It is not a cookie, not a URL switch and not user
 *   selectable, so it cannot be used to fake a role in a deployed app. Unset = unauthenticated.
 *
 * Replace with fe2-b requireRole("doctor") and the fixture-session mapping when merged
 * (docs/frontend/REQUESTS.md #15, #26).
 */
export async function getDoctorSession(env: Env = process.env): Promise<DoctorSession> {
  if (getAdapterMode(env) !== "fixture") {
    return { guard: { status: "unauthenticated" }, ctx: {}, synthetic: false };
  }
  assertFixtureAllowed(env);
  const which = env.FIXTURE_DOCTOR_SESSION;
  const doctorId = which === "assigned" ? FIXTURE_IDS.doctorAssigned : which === "other" ? FIXTURE_IDS.doctorOther : null;
  if (!doctorId) return { guard: { status: "unauthenticated" }, ctx: {}, synthetic: true };
  const actor: FixtureActor = { role: "doctor", doctorId };
  return { guard: { status: "ok" }, ctx: { fixtureActor: actor }, synthetic: true };
}
