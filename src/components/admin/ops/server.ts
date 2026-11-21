import { locale as rootLocale } from "next/root-params";
import { notFound } from "next/navigation";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import type { AdminPrincipal } from "@/modules/admin/capabilities";
import type { AreaAccess, GuardSession } from "@/modules/admin/access";
import { authorizeOperationsSession, requestedWorkspaceKey, requireOperationsSession, type OperationsArea } from "@/modules/admin/session";
import type { ProviderArea } from "@/modules/admin/workspace";

/** SERVER-ONLY helpers shared by the lab, ambulance, caretaker and admin route segments. */

export async function currentLocale(): Promise<AppLocale> {
  const locale = await rootLocale();
  if (!isAppLocale(locale)) notFound();
  return locale;
}

/**
 * Resolves the session (requireRole: signed out -> login with `path` as the return path, wrong
 * role -> own landing) and the selected workspace, then applies the route's pure decision.
 */
export async function providerAreaAccess(
  area: ProviderArea,
  decide: (session: GuardSession, workspaceKey: string | null) => AreaAccess,
  path?: string,
): Promise<AreaAccess> {
  const locale = await currentLocale();
  const [{ guard }, key] = await Promise.all([requireOperationsSession(area, { locale, path }), requestedWorkspaceKey(area)]);
  return decide(guard, key);
}

/**
 * True only when nobody is signed in. Never redirects. Area layouts call this first: signed out,
 * they render their children without a shell so the page's own gate redirects with the page's
 * path as `next` (a layout cannot read the URL, so a layout redirect always used the dashboard).
 */
export async function isSignedOut(area: OperationsArea): Promise<boolean> {
  return (await authorizeOperationsSession(area)).guard === null;
}

export async function adminPrincipal(path?: string): Promise<AdminPrincipal | null> {
  const locale = await currentLocale();
  return (await requireOperationsSession("admin", { locale, path })).admin;
}
