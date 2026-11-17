import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { DemoRole } from "./data";
import { DEMO_COOKIE, DEMO_PROFILE_COOKIE, demoSessionFrom, type DemoSession } from "./auth-core";

export * from "./auth-core";

/**
 * Server-only. The current demo session, or null when demo mode is off or nobody picked a role.
 * Reads cookies, so under cacheComponents call it inside a <Suspense> boundary.
 * Never use the result to authorise real data: it only chooses which synthetic screen to show.
 */
export async function getDemoSession(): Promise<DemoSession | null> {
  const store = await cookies();
  return demoSessionFrom(store.get(DEMO_COOKIE)?.value, undefined, store.get(DEMO_PROFILE_COOKIE)?.value);
}

/**
 * Server-only route guard for signed-in demo screens. Returns the session when its role is allowed.
 * Otherwise redirects to /sign-in?next=<next>, where the person can pick the right demo role
 * (the sign-in page explains which role they are currently using).
 *
 * `next` is the path of the page being guarded, e.g. requireDemoRole(["admin"], "/admin").
 * Call it inside <Suspense> (it reads cookies). Demo only: it protects nothing real.
 */
export async function requireDemoRole(roles: readonly DemoRole[], next: string): Promise<DemoSession> {
  const session = await getDemoSession();
  if (session && roles.includes(session.role)) return session;
  redirect(`/sign-in?next=${encodeURIComponent(next)}`);
}
