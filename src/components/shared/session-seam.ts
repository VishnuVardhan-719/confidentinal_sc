import { logoutAction } from "@/modules/auth/actions";
import { getAccountSession } from "@/modules/auth/server";
import type { Role } from "./role-nav";

/** What the public header needs to know about the visitor. No health data, no tokens. */
export type PublicAccount = {
  displayName: string | null;
  /** Workspaces the server says this account may enter, first = default after sign-in. */
  workspaces: { role: Role; href: string }[];
  /**
   * Sign-out form action: a POST URL, or a server action (fe-b `logoutAction`, which clears the
   * httpOnly session cookies server-side and redirects). The form also posts `locale`.
   */
  signOutAction: string | ((formData: FormData) => void | Promise<void>);
};

/** Session hrefs carry the locale; the i18n `Link` adds it again. */
const localeless = (href: string): string => href.replace(/^\/(en|te|hi)(?=\/|$)/, "") || "/";

/**
 * Session read for the public shell, via fe-b `getAccountSession` (non-PHI view, never
 * redirects). Anything other than a signed-in account (anonymous, lookup unavailable,
 * restricted) keeps the signed-out default. Reading cookies makes the header a dynamic hole;
 * the public layout already wraps it in <Suspense>.
 */
export async function getPublicAccount(): Promise<PublicAccount | null> {
  const account = await getAccountSession();
  if (account.kind !== "signed_in") return null;
  return {
    displayName: account.displayName || null,
    workspaces: account.workspaces.map((w) => ({ role: w.role, href: localeless(w.href) })),
    signOutAction: logoutAction,
  };
}
