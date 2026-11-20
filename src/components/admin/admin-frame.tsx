import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaShell, OpsFrame } from "@/components/admin/ops/area-shell";
import { adminPrincipal, currentLocale } from "@/components/admin/ops/server";
import { AccessDenied } from "@/components/admin/ops/states";
import type { ShellIcon } from "@/components/shared/app-shell";
import type { AppLocale } from "@/i18n/routing";
import type { AdminLoaderContext } from "@/modules/admin/access";
import { adminNavigation, adminPagePath, adminPath, decideAdminRoute, type AdminRoute } from "@/modules/admin/routes";

const ICONS: Record<string, ShellIcon> = {
  dashboard: "home",
  providers: "shield",
  coverage: "map",
  bookings: "calendar",
  users: "users",
  payments: "wallet",
  support: "support",
  reviews: "star",
  cms: "file",
  audit: "clipboard",
  settings: "settings",
};
const PRIMARY = ["dashboard", "bookings", "support", "cms"] as const;

/**
 * Admin layout body: capability-based navigation; no admin capability = denied.
 * Signed out, the layout renders no shell and leaves the redirect to the page's `AdminRouteGate`,
 * because only the page knows its own path for the sign-in `next` (a layout cannot read the URL;
 * redirecting here sent every admin page back to the dashboard). Every admin page is gated; see
 * tests/unit/modules-operations/admin-return-path.test.ts.
 */
export async function AdminFrame({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  const principal = await adminPrincipal(adminPath(locale, "dashboard"));
  const access = decideAdminRoute(principal, "dashboard", locale, adminPath(locale, "dashboard"));
  if (access.kind === "unauthenticated") return <>{children}</>;
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
  subPath,
  children,
}: {
  route: AdminRoute;
  /** Fixed sub page inside `route` (e.g. "log"), so sign-in returns to this page, not the route root. */
  subPath?: string;
  children: (ctx: AdminLoaderContext, locale: AppLocale) => Promise<ReactNode> | ReactNode;
}) {
  const locale = await currentLocale();
  const path = adminPagePath(locale, route, subPath);
  const access = decideAdminRoute(await adminPrincipal(path), route, locale, path);
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind !== "allowed") return <AccessDenied />;
  return <>{await children({ principal: access.principal }, locale)}</>;
}
