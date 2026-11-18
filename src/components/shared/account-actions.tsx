"use client";

import { ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SheetClose } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { loginHref } from "./role-nav";
import type { PublicAccount } from "./session-seam";

/**
 * Sign in / Create account when signed out; dashboard, workspace switcher and Sign out when signed in.
 * `account === undefined` means the session is still loading (reserved space, no flash of wrong
 * buttons). Sign in carries a safe return path (public path only, no query). Sign out is a POST form.
 */
export function AccountActions({ account, variant }: { account: PublicAccount | null | undefined; variant: "desktop" | "mobile" }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const mobile = variant === "mobile";
  const wrap = (node: ReactElement) => (mobile ? <SheetClose asChild>{node}</SheetClose> : node);

  if (account === undefined) {
    return <div aria-hidden className={mobile ? "h-28" : "h-11 w-56"} />;
  }

  if (account === null || account.workspaces.length === 0) {
    return (
      <div className={cn(mobile ? "grid gap-3" : "flex items-center gap-1 whitespace-nowrap")}>
        {mobile ? null : (
          <Button asChild variant="quiet">
            <Link href={loginHref(pathname)}>{t("actions.signIn")}</Link>
          </Button>
        )}
        <Button asChild size={mobile ? "lg" : "md"}>
          {wrap(<Link href="/signup">{t("actions.createAccount")}</Link>)}
        </Button>
        {mobile ? (
          <Button asChild size="lg" variant="secondary">
            {wrap(<Link href={loginHref(pathname)}>{t("actions.signIn")}</Link>)}
          </Button>
        ) : null}
      </div>
    );
  }

  const [primary, ...others] = account.workspaces;
  const signOut = (
    <form action={account.signOutAction} method="post">
      <Button type="submit" variant={mobile ? "secondary" : "quiet"} size={mobile ? "lg" : "md"} className={mobile ? "w-full" : undefined}>
        <LogOut aria-hidden />
        {t("account.signOut")}
      </Button>
    </form>
  );

  if (mobile) {
    return (
      <div className="grid gap-3">
        {account.displayName ? <p className="text-sm text-muted">{t("account.signedInAs", { name: account.displayName })}</p> : null}
        {account.workspaces.map((w, i) => (
          <Button key={w.role} asChild size="lg" variant={i === 0 ? "primary" : "secondary"}>
            {wrap(<Link href={w.href}>
                <LayoutDashboard aria-hidden />
                {t(`account.dashboards.${w.role}`)}
              </Link>)}
          </Button>
        ))}
        {signOut}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button asChild>
        <Link href={primary.href}>
          <LayoutDashboard aria-hidden />
          {t("account.myDashboard")}
        </Link>
      </Button>
      {others.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex min-h-target items-center gap-1 rounded-md px-3 font-medium text-ink hover:bg-mist data-[state=open]:bg-mist">
            {t("account.switch")}
            <ChevronDown aria-hidden className="size-4 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("account.workspaces")}</DropdownMenuLabel>
            {account.workspaces.map((w) => (
              <DropdownMenuItem key={w.role} asChild>
                <Link href={w.href}>{t(`account.dashboards.${w.role}`)}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {signOut}
    </div>
  );
}
