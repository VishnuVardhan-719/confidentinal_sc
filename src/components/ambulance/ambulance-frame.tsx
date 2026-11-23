import { Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AreaChooser, AreaShell, AreaWorkspaceSwitcher, OpsFrame } from "@/components/admin/ops/area-shell";
import { currentLocale, isSignedOut, providerFrameDeferral, providerAreaAccess } from "@/components/admin/ops/server";
import { AccessDenied } from "@/components/admin/ops/states";
import type { ShellIcon } from "@/components/shared/app-shell";
import type { AppLocale } from "@/i18n/routing";
import type { WorkspaceLoaderContext } from "@/modules/admin/access";
import { ambulanceNavigation, ambulancePath, decideAmbulanceRoute, type AmbulanceRoute } from "@/modules/ambulance/routes";

const ICONS: Record<string, ShellIcon> = {
  dashboard: "home",
  fleet: "ambulance",
  crew: "users",
  availability: "calendar",
  requests: "inbox",
  trips: "map",
  driver: "map",
  billing: "wallet",
  support: "support",
  emergency: "shield",
};
const PRIMARY = ["dashboard", "requests", "trips", "driver", "emergency"] as const;

/** "Call 108" stays visible in the top bar on every ambulance screen (plain tel: link, works without JS). */
async function Call112() {
  const t = await getTranslations("ambulance.emergency");
  return (
    <a
      href="tel:108"
      className="inline-flex min-h-target items-center gap-2 rounded-md bg-danger px-3 text-base font-semibold text-white hover:bg-danger-strong focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Phone aria-hidden className="size-5" />
      {t("callButton")}
    </a>
  );
}

export async function AmbulanceFrame({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  // Signed out: no shell, and the page's AmbulanceRouteGate redirects with its own path as `next`.
  if (await isSignedOut("ambulance")) return <>{children}</>;
  // No active workspace (applicant, no workspace yet, or restricted): the page decides (see providerFrameDeferral).
  // This runs before the area guard, which would send a user without a workspace here to their own landing page,
  // and the onboarding page is exactly where a signed-in user starts a provider application.
  if ((await providerFrameDeferral("ambulance", locale)).defer) return <>{children}</>;
  const access = await providerAreaAccess("ambulance", (s, key) => decideAmbulanceRoute(s, "dashboard", locale, ambulancePath(locale, "dashboard"), key), ambulancePath(locale, "dashboard"));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind === "denied") {
    return (
      <OpsFrame>
        <Call112 />
        <AccessDenied />
      </OpsFrame>
    );
  }
  if (access.kind === "choose_workspace") return <AreaChooser area="ambulance" options={access.options} />;
  const t = await getTranslations("ambulance");
  return (
    <AreaShell
      workspaceLabel={`${t("workspaceLabel")} · ${access.workspace.displayName}`}
      nav={ambulanceNavigation(access.workspace, locale)}
      icons={ICONS}
      primary={PRIMARY}
      topbarTitle={access.workspace.displayName}
      topbarActions={
        <div className="flex items-center gap-2">
          <Call112 />
          <AreaWorkspaceSwitcher area="ambulance" workspace={access.workspace} options={access.options} />
        </div>
      }
    >
      {children}
    </AreaShell>
  );
}

export async function AmbulanceRouteGate({
  route,
  children,
}: {
  route: AmbulanceRoute;
  children: (ctx: WorkspaceLoaderContext, locale: AppLocale) => Promise<ReactNode> | ReactNode;
}) {
  const locale = await currentLocale();
  const access = await providerAreaAccess("ambulance", (s, key) => decideAmbulanceRoute(s, route, locale, ambulancePath(locale, route), key), ambulancePath(locale, route));
  if (access.kind === "unauthenticated") redirect(access.loginPath);
  if (access.kind !== "allowed") {
    if (access.kind === "denied") {
      const { defer, setupPath } = await providerFrameDeferral("ambulance", locale);
      if (setupPath) redirect(setupPath);
      // The frame rendered no shell for this user, so the denial brings its own.
      if (defer) return <OpsFrame><AccessDenied /></OpsFrame>;
    }
    return <AccessDenied />;
  }
  return <>{await children({ workspace: access.workspace }, locale)}</>;
}
