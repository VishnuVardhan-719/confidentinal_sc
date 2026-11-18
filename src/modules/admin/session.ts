import { cookies } from "next/headers";
import { connection } from "next/server";
import type { GuardSession } from "./access";
import type { AdminPrincipal } from "./capabilities";
import { parseWorkspaceKey, workspaceCookieName, type ProviderArea } from "./workspace";

/**
 * SERVER-ONLY session port for the lab, ambulance, caretaker and admin areas.
 *
 * The identity source is the auth module (src/modules/auth, fe2-b), which is not
 * merged into this branch yet. Until it is, this port reports "no session", so
 * every private route redirects to login. There are deliberately no demo
 * accounts, role cookies or "try as" switches here (CONVENTIONS: data honesty).
 *
 * Integration (REQUESTS.md R-E11/R-E17): map `getServerSession()` from the auth
 * module to `GuardSession` (profileId + memberships with scopes/resourceId) and
 * to `AdminPrincipal` (status, server-asserted MFA, grants). Nothing else in the
 * areas needs to change.
 */
export type OperationsSession = { guard: GuardSession; admin: AdminPrincipal | null };

export async function getOperationsSession(): Promise<OperationsSession> {
  // Request-time only: identity must never be prerendered or cached.
  await connection();
  return { guard: null, admin: null };
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
