import { redirect } from "next/navigation";
import { authorizeRole, getRequestApis, requireRole } from "@/modules/auth/server";
import type { Locale } from "@/modules/auth/roles";
import { checkProfileGate, type ProfileGateOutcome } from "./profile-gate";

/**
 * SERVER-ONLY profile gate for booking (USER-REQ-1 D). Re-checks the patient role on every
 * call, then the 13-item profile.
 *
 * Pages: `const gate = await requireCompleteProfile({ locale, path })`. Sends signed-out users to
 * sign in, sends incomplete profiles to /patient/profile, and returns `complete` or a failure
 * (`forbidden`/`gated`/`not_found`/`error`) for the page to render. Only `complete` may book.
 *
 * Server actions: `const gate = await authorizeCompleteProfile({ locale })`. Never redirects.
 * Refuse the mutation unless `gate.kind === "complete"`.
 */
export type RequiredProfileOutcome = Exclude<ProfileGateOutcome, { kind: "incomplete" }>;

export async function requireCompleteProfile(options: { locale: Locale; path?: string }): Promise<RequiredProfileOutcome> {
  const access = await requireRole("patient", options);
  if (access.kind !== "allowed") return { kind: "forbidden" };
  const { onboarding } = await getRequestApis();
  const gate = await checkProfileGate(onboarding, options.locale);
  if (gate.kind === "incomplete") redirect(gate.fixPath);
  return gate;
}

export async function authorizeCompleteProfile(options: { locale: Locale; path?: string }): Promise<ProfileGateOutcome> {
  const access = await authorizeRole("patient", options);
  if (access.kind !== "allowed") return { kind: "forbidden" };
  const { onboarding } = await getRequestApis();
  return checkProfileGate(onboarding, options.locale);
}
