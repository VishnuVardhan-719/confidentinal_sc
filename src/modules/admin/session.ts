import { cookies } from "next/headers";
import { connection } from "next/server";
import { getAdapterMode } from "@/lib/api/mode";
import { assertFixtureMode } from "@/lib/api/fixture";
import type { GuardSession } from "./access";
import type { AdminPrincipal } from "./capabilities";
import { parseWorkspaceKey, workspaceCookieName, type ProviderArea } from "./workspace";

/**
 * SERVER-ONLY session port for the lab, ambulance, caretaker and admin areas.
 *
 * The identity source is the auth module (src/modules/auth, fe2-b), which is not
 * merged into this branch yet. Until it is, this port reports "no session", so
 * every private route redirects to login. There are no role cookies or "try as"
 * switches here (CONVENTIONS: data honesty).
 *
 * One narrow fixture exception (fe-p R8-P2, REQUESTS.md R-FE-P-R8-1): in fixture mode only (never
 * production; assertFixtureMode throws), the SERVER env var FIXTURE_ADMIN_SESSION=moderator yields a
 * synthetic admin holding only `review:moderate`, so the review-moderation queue can be reviewed and
 * tested. It is not a cookie, URL or user choice. Remove it when the auth module is adopted.
 *
 * Integration (REQUESTS.md R-E11/R-E17): map `getServerSession()` from the auth
 * module to `GuardSession` (profileId + memberships with scopes/resourceId) and
 * to `AdminPrincipal` (status, server-asserted MFA, grants). Nothing else in the
 * areas needs to change.
 */
export type OperationsSession = { guard: GuardSession; admin: AdminPrincipal | null };

const FIXTURE_MODERATOR: AdminPrincipal = {
  profileId: "00000000-0000-4000-8000-0000000000ad",
  status: "active",
  mfaVerified: true,
  grants: [{ capability: "review:moderate", scope: { kind: "global" }, grantedAt: "2026-11-01T00:00:00.000Z", expiresAt: null, revokedAt: null }],
};

export function fixtureAdminPrincipal(env: Record<string, string | undefined> = process.env): AdminPrincipal | null {
  if (getAdapterMode(env) !== "fixture" || env.FIXTURE_ADMIN_SESSION !== "moderator") return null;
  assertFixtureMode(env);
  return FIXTURE_MODERATOR;
}

export async function getOperationsSession(): Promise<OperationsSession> {
  // Request-time only: identity must never be prerendered or cached.
  await connection();
  return { guard: null, admin: fixtureAdminPrincipal() };
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
