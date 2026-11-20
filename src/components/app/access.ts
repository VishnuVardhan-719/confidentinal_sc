/*
 * Which signed-in routes each account role may open, and where each role lands. Roles come from
 * GET /api/auth/me (identity_roles), never from the URL. This only decides what the UI shows: every API call
 * is authorized again on the server and in the database.
 */

export const ROLES = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PROVIDER_ROLES = ["doctor", "lab", "ambulance", "caretaker"] as const satisfies readonly Role[];
export type ProviderRole = (typeof PROVIDER_ROLES)[number];

export const APP_ROUTES = ["/dashboard", "/book", "/provider", "/provider/onboarding", "/admin", "/account"] as const;
export type AppRoute = (typeof APP_ROUTES)[number];

export const ROUTE_ROLES: Record<AppRoute, readonly Role[]> = {
  "/dashboard": ["patient"],
  "/book": ["patient"],
  "/provider": PROVIDER_ROLES,
  // Applying to become a provider starts from an ordinary account, so every signed-in role may open it.
  "/provider/onboarding": ROLES,
  "/admin": ["admin"],
  "/account": ROLES,
};

/** Keeps only role strings this UI knows about. */
export function knownRoles(values: readonly unknown[]): Role[] {
  return ROLES.filter((role) => values.includes(role));
}

export function isProviderRole(role: Role): role is ProviderRole {
  return (PROVIDER_ROLES as readonly string[]).includes(role);
}

/** The most specific workspace wins: admin, then provider, then patient (every active account is a patient). */
export function homeFor(roles: readonly Role[]): AppRoute {
  if (roles.includes("admin")) return "/admin";
  if (roles.some(isProviderRole)) return "/provider";
  if (roles.includes("patient")) return "/dashboard";
  return "/account";
}

export function mayOpen(roles: readonly Role[], route: AppRoute): boolean {
  return ROUTE_ROLES[route].some((role) => roles.includes(role));
}

function routeFor(pathname: string): AppRoute | null {
  return (
    [...APP_ROUTES]
      .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

/** True when the roles may open the path. Paths outside the app area are public. */
export function canAccess(roles: readonly Role[], path: string): boolean {
  const route = routeFor(path.split(/[?#]/)[0] ?? "");
  return route === null || mayOpen(roles, route);
}

/**
 * A same-site path from a `?next=` value, or null. Rejects absolute and protocol-relative URLs, backslash
 * tricks, control characters and auth pages (which would loop).
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://same.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://same.invalid") return null;
  if (/^\/(sign-in|sign-up|sign-out|forgot-password)(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/** Where to go after sign-in: `next` when the account may open it, otherwise the account's home. */
export function destinationFor(roles: readonly Role[], next: unknown): string {
  const target = safeNext(next);
  return target && canAccess(roles, target) ? target : homeFor(roles);
}

export function signInUrl(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}
