import type { DemoRole } from "@/lib/demo/data";

/**
 * Which demo roles may open each signed-in route. Pure, so it is unit-tested.
 *
 * This decides which SYNTHETIC screen to show, nothing more. The demo cookie is not authentication;
 * when real auth (I01) lands, every route must check the server session and the database (RLS) instead.
 */
export const APP_ROUTES = ["/dashboard", "/book", "/provider", "/provider/onboarding", "/caretaker", "/admin", "/account"] as const;
export type AppRoute = (typeof APP_ROUTES)[number];

const PROVIDERS: readonly DemoRole[] = ["doctor", "lab", "ambulance"];

export const ROUTE_ROLES: Record<AppRoute, readonly DemoRole[]> = {
  "/dashboard": ["patient"],
  "/book": ["patient"],
  "/provider": PROVIDERS,
  "/provider/onboarding": PROVIDERS,
  "/caretaker": ["caretaker"],
  "/admin": ["admin"],
  "/account": ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"],
};

/** Each role's home in the app. Must match where demo sign-in sends people (DEMO_HOME in lib/demo/auth-core). */
export const ROLE_HOME: Record<DemoRole, AppRoute> = {
  patient: "/dashboard",
  doctor: "/provider",
  lab: "/provider",
  ambulance: "/provider",
  caretaker: "/caretaker",
  admin: "/admin",
};

export function signInUrl(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * No session: send to sign-in, keeping where they were going. Signed in with a role that may not open
 * the route: send to that role's own home instead, so a signed-in user is never bounced to sign-in in a loop.
 */
export function gate(
  session: { role: DemoRole } | null,
  route: AppRoute,
  next: string = route,
): { ok: true } | { ok: false; redirectTo: string } {
  if (!session) return { ok: false, redirectTo: signInUrl(next) };
  if (ROUTE_ROLES[route].includes(session.role)) return { ok: true };
  return { ok: false, redirectTo: ROLE_HOME[session.role] };
}

/**
 * The `next` path for /book, keeping only the booking prefill keys from the query. Values are length-capped
 * strings; prefillFromParams checks them against the demo data again when the page reads them.
 */
export function bookNextPath(query: Record<string, string | string[] | undefined>): string {
  const kept = new URLSearchParams();
  for (const key of ["provider", "service", "slot"]) {
    const value = query[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 64) kept.set(key, value);
  }
  const qs = kept.toString();
  return qs ? `/book?${qs}` : "/book";
}
