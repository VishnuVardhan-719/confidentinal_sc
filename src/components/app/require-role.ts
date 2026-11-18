import { redirect } from "next/navigation";
import { getDemoSession, type DemoSession } from "@/lib/demo/auth";
import { gate, type AppRoute } from "./access";

/**
 * Server components only. Returns the demo session if its role may open `route`, otherwise redirects to
 * /sign-in?next=... Reads cookies, so the caller must sit inside a Suspense boundary (the (app) layout provides one).
 *
 * Local stand-in with the same intent as the auth task's planned `requireDemoRole(roles)`; switch to that
 * export once it lands so there is one guard. Not authentication: see access.ts.
 */
export async function requireDemoRole(route: AppRoute, next?: string): Promise<DemoSession> {
  const session = await getDemoSession();
  const decision = gate(session, route, next);
  if (!decision.ok) redirect(decision.redirectTo);
  return session!;
}
