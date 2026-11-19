import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaChooser, AreaShell, AreaWorkspaceSwitcher, OpsFrame } from "@/components/admin/ops/area-shell";
import { currentLocale, providerAreaAccess } from "@/components/admin/ops/server";
import { AccessDenied } from "@/components/admin/ops/states";
import type { ShellIcon } from "@/components/shared/app-shell";
import type { WorkspaceLoaderContext } from "@/modules/admin/access";
import type { AppLocale } from "@/i18n/routing";
import { decideLabRoute, labNavigation, labPath, type LabRoute } from "@/modules/lab/routes";

const ICONS: Record<string, ShellIcon> = {
  dashboard: "home",
  branches: "building",
  catalog: "flask",
  staff: "users",
  orders: "inbox",
  collections: "clipboard",
  reports: "file",
  billing: "wallet",
  support: "support",
};
const PRIMARY = ["dashboard", "orders", "collections", "reports"] as const;

/** Lab layout body: unauthenticated -> login, no lab workspace -> denied, several -> choose, else shell. */
export async function LabFrame({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  const access = await providerAreaAccess("lab", (s, key) => decideLabRoute(s, "dashboard", locale, labPath(locale, "dashboard"), key), labPath(locale, "dashboard"));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind === "denied") {
    return (
      <OpsFrame>
        <AccessDenied />
      </OpsFrame>
    );
  }
  if (access.kind === "choose_workspace") return <AreaChooser area="lab" options={access.options} />;
  const t = await getTranslations("lab");
  return (
    <AreaShell
      workspaceLabel={`${t("workspaceLabel")} · ${access.workspace.displayName}`}
      nav={labNavigation(access.workspace, locale)}
      icons={ICONS}
      primary={PRIMARY}
      topbarTitle={access.workspace.displayName}
      topbarActions={<AreaWorkspaceSwitcher area="lab" workspace={access.workspace} options={access.options} />}
    >
      {children}
    </AreaShell>
  );
}

/**
 * Page-level guard for one lab route. Renders the denied state when the role
 * may not open this route (for example a collector opening Reports).
 */
export async function LabRouteGate({
  route,
  children,
}: {
  route: LabRoute;
  children: (ctx: WorkspaceLoaderContext, locale: AppLocale) => Promise<ReactNode> | ReactNode;
}) {
  const locale = await currentLocale();
  const access = await providerAreaAccess("lab", (s, key) => decideLabRoute(s, route, locale, labPath(locale, route), key), labPath(locale, route));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind !== "allowed") return <AccessDenied />;
  return <>{await children({ workspace: access.workspace }, locale)}</>;
}
