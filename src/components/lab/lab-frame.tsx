import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaChooser, AreaShell, AreaWorkspaceSwitcher, OpsFrame } from "@/components/admin/ops/area-shell";
import { currentLocale, isSignedOut, providerFrameDeferral, providerAreaAccess } from "@/components/admin/ops/server";
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
  // Signed out: no shell, and the page's LabRouteGate redirects with its own path as `next`.
  if (await isSignedOut("lab")) return <>{children}</>;
  // No active workspace (applicant, no workspace yet, or restricted): the page decides (see providerFrameDeferral).
  // This runs before the area guard, which would send a user without a workspace here to their own landing page,
  // and the onboarding page is exactly where a signed-in user starts a provider application.
  if ((await providerFrameDeferral("lab", locale)).defer) return <>{children}</>;
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
  if (access.kind !== "allowed") {
    if (access.kind === "denied") {
      const { defer, setupPath } = await providerFrameDeferral("lab", locale);
      if (setupPath) redirect(setupPath);
      // The frame rendered no shell for this user, so the denial brings its own.
      if (defer) return <OpsFrame><AccessDenied /></OpsFrame>;
    }
    return <AccessDenied />;
  }
  return <>{await children({ workspace: access.workspace }, locale)}</>;
}
