import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaShell, OpsFrame } from "@/components/admin/ops/area-shell";
import { adminPrincipal, currentLocale } from "@/components/admin/ops/server";
import { AccessDenied } from "@/components/admin/ops/states";
import type { ShellIcon } from "@/components/shared/app-shell";
import type { AppLocale } from "@/i18n/routing";
import type { AdminLoaderContext } from "@/modules/admin/access";
import { adminNavigation, adminPath, decideAdminRoute, type AdminRoute } from "@/modules/admin/routes";

const ICONS: Record<string, ShellIcon> = {
  dashboard: "home",
  providers: "shield",
  coverage: "map",
  bookings: "calendar",
  users: "users",
  payments: "wallet",
  support: "support",
  cms: "file",
  audit: "clipboard",
  settings: "settings",
};
const PRIMARY = ["dashboard", "bookings", "support", "cms"] as const;

/** Admin layout body: capability-based navigation; no admin capability = denied. */
export async function AdminFrame({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  const principal = await adminPrincipal();
  const access = decideAdminRoute(principal, "dashboard", locale, adminPath(locale, "dashboard"));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind === "denied") {
    return (
      <OpsFrame>
        <AccessDenied />
      </OpsFrame>
    );
  }
  const t = await getTranslations("admin");
  return (
    <AreaShell workspaceLabel={t("workspaceLabel")} nav={adminNavigation(access.principal, locale)} icons={ICONS} primary={PRIMARY} topbarTitle={t("workspaceLabel")}>
      {children}
    </AreaShell>
  );
}

export async function AdminRouteGate({
  route,
  children,
}: {
  route: AdminRoute;
  children: (ctx: AdminLoaderContext, locale: AppLocale) => Promise<ReactNode> | ReactNode;
}) {
  const locale = await currentLocale();
  const access = decideAdminRoute(await adminPrincipal(), route, locale, adminPath(locale, route));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind !== "allowed") return <AccessDenied />;
  return <>{await children({ principal: access.principal }, locale)}</>;
}
