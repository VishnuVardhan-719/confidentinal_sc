import { locale as rootLocale } from "next/root-params";
import { notFound } from "next/navigation";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import type { AdminPrincipal } from "@/modules/admin/capabilities";
import type { AreaAccess, GuardSession } from "@/modules/admin/access";
import { getOperationsSession, requestedWorkspaceKey } from "@/modules/admin/session";
import type { ProviderArea } from "@/modules/admin/workspace";

/** SERVER-ONLY helpers shared by the lab, ambulance, caretaker and admin route segments. */

export async function currentLocale(): Promise<AppLocale> {
  const locale = await rootLocale();
  if (!isAppLocale(locale)) notFound();
  return locale;
}

/** Resolves the session and selected workspace, then applies the route's pure decision. */
export async function providerAreaAccess(
  area: ProviderArea,
  decide: (session: GuardSession, workspaceKey: string | null) => AreaAccess,
): Promise<AreaAccess> {
  const [{ guard }, key] = await Promise.all([getOperationsSession(), requestedWorkspaceKey(area)]);
  return decide(guard, key);
}

export async function adminPrincipal(): Promise<AdminPrincipal | null> {
  return (await getOperationsSession()).admin;
}
