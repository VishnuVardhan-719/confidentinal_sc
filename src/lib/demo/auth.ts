import { cookies } from "next/headers";
import { DEMO_COOKIE, demoSessionFrom, type DemoSession } from "./auth-core";

export * from "./auth-core";

/**
 * Server-only. The current demo session, or null when demo mode is off or nobody picked a role.
 * Reads cookies, so under cacheComponents call it inside a <Suspense> boundary.
 * Never use the result to authorise real data: it only chooses which synthetic screen to show.
 */
export async function getDemoSession(): Promise<DemoSession | null> {
  const store = await cookies();
  return demoSessionFrom(store.get(DEMO_COOKIE)?.value);
}
