import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppShell, type ShellIcon, type ShellNavItem } from "@/components/shared/app-shell";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { switchWorkspaceAction } from "@/modules/admin/server-actions";
import type { NavItem } from "@/modules/admin/routes";
import type { ProviderArea, Workspace } from "@/modules/admin/workspace";
import { useKeyTranslator } from "./ops-status";
import { WorkspaceChooser, WorkspaceSwitcher } from "./workspace-switcher";

const stripLocale = (href: string) => href.replace(/^\/(en|te|hi)(?=\/|$)/, "") || "/";

/**
 * Area shell around AppShell. Nav items come from the route permission map, so
 * a role only sees what its guard allows; the guard still decides every request.
 */
export function AreaShell({
  workspaceLabel,
  nav,
  icons,
  primary,
  topbarTitle,
  topbarActions,
  children,
}: {
  workspaceLabel: string;
  nav: NavItem[];
  icons: Record<string, ShellIcon>;
  primary: readonly string[];
  topbarTitle?: ReactNode;
  topbarActions?: ReactNode;
  children: ReactNode;
}) {
  const tk = useKeyTranslator();
  const items: ShellNavItem[] = nav.map((n) => ({
    href: stripLocale(n.href),
    label: tk(n.labelKey),
    icon: icons[n.route] ?? "home",
    primary: primary.includes(n.route),
  }));
  return (
    <AppShell workspaceLabel={workspaceLabel} nav={items} topbarTitle={topbarTitle} topbarActions={topbarActions}>
      {children}
    </AppShell>
  );
}

/** Organization switcher for the shell top bar (server wrapper with localized labels). */
export function AreaWorkspaceSwitcher({ area, workspace, options }: { area: ProviderArea; workspace: Workspace; options: Workspace[] }) {
  const t = useTranslations("admin.ops.workspace");
  return (
    <WorkspaceSwitcher
      options={options.map((o) => ({ key: o.key, name: o.displayName }))}
      currentKey={workspace.key}
      labels={{ switch: t("switch"), heading: t("heading") }}
      onSwitch={switchWorkspaceAction.bind(null, area)}
    />
  );
}

/** Minimal page frame (no area nav) for denied and choose-organization states. */
export function OpsFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-content items-center px-4 sm:px-6 lg:px-8">
          <BrandLogo />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto grid w-full max-w-content flex-1 content-start gap-6 px-4 py-12 outline-none sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}

export function AreaChooser({ area, options }: { area: ProviderArea; options: Workspace[] }) {
  const t = useTranslations("admin.ops.workspace");
  return (
    <OpsFrame>
      <WorkspaceChooser
        options={options.map((o) => ({ key: o.key, name: o.displayName }))}
        labels={{ title: t("chooseTitle"), body: t("chooseBody"), open: t("open") }}
        onSwitch={switchWorkspaceAction.bind(null, area)}
      />
    </OpsFrame>
  );
}
