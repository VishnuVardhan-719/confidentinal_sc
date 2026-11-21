import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaChooser, AreaShell, AreaWorkspaceSwitcher, OpsFrame } from "@/components/admin/ops/area-shell";
import { currentLocale, isSignedOut, providerFrameDeferral, providerAreaAccess } from "@/components/admin/ops/server";
import { AccessDenied } from "@/components/admin/ops/states";
import type { ShellIcon } from "@/components/shared/app-shell";
import type { AppLocale } from "@/i18n/routing";
import type { WorkspaceLoaderContext } from "@/modules/admin/access";
import { caretakerNavigation, caretakerPath, decideCaretakerRoute, type CaretakerRoute } from "@/modules/caretaker/routes";

const ICONS: Record<string, ShellIcon> = {
  dashboard: "home",
  services: "care",
  staff: "users",
  availability: "calendar",
  requests: "inbox",
  assignments: "clipboard",
  shifts: "calendar",
  plans: "file",
  billing: "wallet",
  support: "support",
};
const PRIMARY = ["dashboard", "requests", "assignments", "shifts"] as const;

export async function CaretakerFrame({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  // Signed out: no shell, and the page's CaretakerRouteGate redirects with its own path as `next`.
  if (await isSignedOut("caretaker")) return <>{children}</>;
  // No active workspace (applicant, no workspace yet, or restricted): the page decides (see providerFrameDeferral).
  // This runs before the area guard, which would send a user without a workspace here to their own landing page,
  // and the onboarding page is exactly where a signed-in user starts a provider application.
  if ((await providerFrameDeferral("caretaker", locale)).defer) return <>{children}</>;
  const access = await providerAreaAccess("caretaker", (s, key) => decideCaretakerRoute(s, "dashboard", locale, caretakerPath(locale, "dashboard"), key), caretakerPath(locale, "dashboard"));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind === "denied") {
    return (
      <OpsFrame>
        <AccessDenied />
      </OpsFrame>
    );
  }
  if (access.kind === "choose_workspace") return <AreaChooser area="caretaker" options={access.options} />;
  const t = await getTranslations("caretaker");
  return (
    <AreaShell
      workspaceLabel={`${t("workspaceLabel")} · ${access.workspace.displayName}`}
      nav={caretakerNavigation(access.workspace, locale)}
      icons={ICONS}
      primary={PRIMARY}
      topbarTitle={access.workspace.displayName}
      topbarActions={<AreaWorkspaceSwitcher area="caretaker" workspace={access.workspace} options={access.options} />}
    >
      {children}
    </AreaShell>
  );
}

export async function CaretakerRouteGate({
  route,
  children,
}: {
  route: CaretakerRoute;
  children: (ctx: WorkspaceLoaderContext, locale: AppLocale) => Promise<ReactNode> | ReactNode;
}) {
  const locale = await currentLocale();
  const access = await providerAreaAccess("caretaker", (s, key) => decideCaretakerRoute(s, route, locale, caretakerPath(locale, route), key), caretakerPath(locale, route));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind !== "allowed") {
    if (access.kind === "denied") {
      const { defer, setupPath } = await providerFrameDeferral("caretaker", locale);
      if (setupPath) redirect(setupPath);
      // The frame rendered no shell for this user, so the denial brings its own.
      if (defer) return <OpsFrame><AccessDenied /></OpsFrame>;
    }
    return <AccessDenied />;
  }
  return <>{await children({ workspace: access.workspace }, locale)}</>;
}
