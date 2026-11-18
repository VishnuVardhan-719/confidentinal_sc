import type { Role } from "./role-nav";

/** What the public header needs to know about the visitor. No health data, no tokens. */
export type PublicAccount = {
  displayName: string | null;
  /** Workspaces the server says this account may enter, first = default after sign-in. */
  workspaces: { role: Role; href: string }[];
  /** POST target that signs out server-side (clears httpOnly cookies) and redirects home. */
  signOutAction: string;
};

/**
 * Session read for the public shell.
 *
 * Seam: the auth module (fe-b, `@/modules/auth/server`) is not on this branch. On integration,
 * replace the body with its session lookup, mapping each authorized workspace to
 * `{ role, href: roleDashboardHref(role) }` (or the onboarding route when incomplete) and its
 * sign-out route (docs/frontend/REQUESTS.md R-FE01-6). Reading cookies here makes the header a
 * dynamic hole; the public layout already wraps it in <Suspense>.
 */
export async function getPublicAccount(): Promise<PublicAccount | null> {
  return null;
}
