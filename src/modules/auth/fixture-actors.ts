import { DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as CLINICAL, type FixtureActor } from "@/fixtures/clinical/world";
import { FIXTURE_IDS as IDENTITY } from "@/fixtures/identity";
import type { GuardOutcome } from "./guard";
import type { Identity } from "./types";

/**
 * Maps a signed-in SYNTHETIC identity (fixture auth adapter) to the actor of the synthetic
 * clinical/booking world. Pure and fixture-only: the http adapters never read a FixtureActor,
 * they send the bearer token and the backend decides. An identity without a mapping gets no
 * actor, so the fixture adapters deny everything (fail closed).
 */
const DOCTOR_BY_USER: Readonly<Record<string, string>> = {
  [IDENTITY.doctorActiveUser]: CLINICAL.doctorAssigned,
  [IDENTITY.multiRoleUser]: CLINICAL.doctorAssigned,
  [IDENTITY.doctorOtherUser]: CLINICAL.doctorOther,
};

export function fixtureActorFor(identity: Identity, role: "patient" | "doctor"): FixtureActor | null {
  if (role === "patient") {
    // The synthetic world has one patient (REQUESTS R-FE-D-26); every allowed patient sees it.
    return identity.workspaces.some((w) => w.role === "patient") ? DEFAULT_PATIENT_ACTOR : null;
  }
  const doctorId = DOCTOR_BY_USER[identity.userId];
  return doctorId ? { role: "doctor", doctorId } : null;
}

/** True only for the guard's sign-in redirect (other redirects are wrong-role or setup refusals). */
export const isLoginRedirect = (outcome: GuardOutcome): boolean => outcome.kind === "redirect" && /^\/[a-z]{2}\/login(\?|$)/.test(outcome.to);
