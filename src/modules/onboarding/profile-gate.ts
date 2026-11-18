import type { Locale } from "@/modules/auth/roles";
import { onboardingPath } from "@/modules/auth/routes";
import type { OnboardingApi } from "./api";
import { loadPatientProfile, type LoadFailure, type PatientProfilePage } from "./loaders";
import type { ProfileCompleteness, ProfileItemId } from "./profile";

/**
 * USER-REQ-1 D booking gate: a patient may book only when all 13 profile items are complete
 * (PROFILE_ITEMS in ./profile). Pure and unit-testable; the server wrappers live in
 * ./profile-gate-server. Fails closed: any load failure is a refusal, never a pass.
 * This is a UX gate. The booking backend must enforce the same rule (REQUESTS.md R-FE06-08).
 */
export type ProfileGateOutcome =
  | { kind: "complete"; completeness: ProfileCompleteness }
  | {
      kind: "incomplete";
      completed: number;
      total: number;
      missing: ProfileItemId[];
      /** Patient onboarding, where the profile is finished. No profile data in the URL. */
      fixPath: string;
    }
  | LoadFailure;

export const profileFixPath = (locale: Locale): string => onboardingPath("patient", locale);

export function decideProfileGate(page: PatientProfilePage, locale: Locale): ProfileGateOutcome {
  if (page.kind !== "ready") return page;
  const { completeness } = page;
  if (completeness.readyToBook && completeness.missing.length === 0) return { kind: "complete", completeness };
  return {
    kind: "incomplete",
    completed: completeness.completed,
    total: completeness.total,
    missing: [...completeness.missing],
    fixPath: profileFixPath(locale),
  };
}

export async function checkProfileGate(api: OnboardingApi, locale: Locale, now: Date = new Date()): Promise<ProfileGateOutcome> {
  return decideProfileGate(await loadPatientProfile(api, now), locale);
}
