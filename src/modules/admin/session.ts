import { cookies } from "next/headers";
import { connection } from "next/server";
import { OPERATIONS_PROFILE_BY_USER } from "@/fixtures/identity/operations";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { workspaceMemberships } from "@/fixtures/operations/workspaces";
import type { Locale } from "@/modules/auth/roles";
import { authorizeRole, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import type { GuardOutcome } from "@/modules/auth/guard";
import type { Identity } from "@/modules/auth/types";
import type { GuardSession } from "./access";
import type { AdminPrincipal } from "./capabilities";
import { parseWorkspaceKey, workspaceCookieName, type ProviderArea, type WorkspaceMembership } from "./workspace";

/**
 * SERVER-ONLY session port for the lab, ambulance, caretaker and admin areas, built on the
 * auth module's guards:
 * - pages: `requireRole(area)` (signed out -> login with a safe return path; wrong role ->
 *   the user's own landing page; a workspace that exists but is not usable -> denied);
 * - server actions: `authorizeRole(area)` (never redirects; anything but allowed is refused).
 * An allowed identity is then mapped to the operations view (memberships with scopes and
 * resource, or the admin principal with MFA and grants).
 *
 * Fixture mode maps identity users to the SYNTHETIC operations profiles. The http session
 * (I01) carries no scopes, resource IDs, MFA or grants yet, so in http mode an allowed user
 * gets an empty operations view: every area page is denied, never guessed (fail closed,
 * docs/frontend/REQUESTS.md R-FE07-02).
 */
export type OperationsArea = ProviderArea | "admin";
export type OperationsSession = { guard: GuardSession; admin: AdminPrincipal | null };

/** Signed out: the pure decisions turn this into a login redirect. */
const SIGNED_OUT: OperationsSession = { guard: null, admin: null };

/** Signed in but not allowed: no memberships and a principal that can do nothing. */
const deniedSession = (profileId = ""): OperationsSession => ({
  guard: { profileId, memberships: [] },
  admin: { profileId, status: "revoked", mfaVerified: false, grants: [] },
});

const FIXTURE_MEMBERSHIPS: readonly WorkspaceMembership[] = Object.values(workspaceMemberships).flat();
const FIXTURE_PRINCIPALS: readonly AdminPrincipal[] = Object.values(adminPrincipals);

/** Allowed identity -> operations view for one area. Exported for unit tests. */
export function operationsViewFor(identity: Identity, area: OperationsArea, fixture: boolean): OperationsSession {
  const profileId = fixture ? OPERATIONS_PROFILE_BY_USER[identity.userId] : undefined;
  if (!profileId) return deniedSession(identity.userId);
  if (area === "admin") {
    const principal = FIXTURE_PRINCIPALS.find((p) => p.profileId === profileId);
    return principal ? { guard: deniedSession(profileId).guard, admin: principal } : deniedSession(profileId);
  }
  const memberships = FIXTURE_MEMBERSHIPS.filter((m) => m.profileId === profileId && m.area === area);
  return { guard: { profileId, memberships }, admin: deniedSession(profileId).admin };
}

function fromOutcome(outcome: GuardOutcome, area: OperationsArea): OperationsSession {
  if (outcome.kind === "allowed") return operationsViewFor(outcome.identity, area, isFixtureAdapter());
  // Only a redirect to sign-in means "signed out"; wrong-role / setup redirects are refusals.
  if (outcome.kind === "redirect") return /^\/[a-z]{2}\/login(\?|$)/.test(outcome.to) ? SIGNED_OUT : deniedSession();
  return deniedSession();
}

/** For layouts and pages. May redirect (login, or the user's own landing for a wrong role). */
export async function requireOperationsSession(area: OperationsArea, options: { locale: Locale; path?: string }): Promise<OperationsSession> {
  // Request-time only: identity must never be prerendered or cached.
  await connection();
  return fromOutcome(await requireRole(area, options), area);
}

/** For server actions. Never redirects; signed out maps to `unauthenticated`, everything else not allowed to denied. */
export async function authorizeOperationsSession(area: OperationsArea): Promise<OperationsSession> {
  await connection();
  // Locale only shapes redirect targets, which actions never follow; "en" keeps this request-independent.
  return fromOutcome(await authorizeRole(area, { locale: "en" }), area);
}

/** The selected workspace key for an area, from its cookie (provider key only, no personal data). */
export async function requestedWorkspaceKey(area: ProviderArea): Promise<string | null> {
  const store = await cookies();
  return parseWorkspaceKey(store.get(workspaceCookieName(area))?.value);
}

/** Short-lived httpOnly cookie carrying a validated booking reference, so it never appears in a URL. */
export const BOOKING_LOOKUP_COOKIE = "scv_admin_booking_ref";

export async function bookingLookupReference(): Promise<string | null> {
  return (await cookies()).get(BOOKING_LOOKUP_COOKIE)?.value ?? null;
}
