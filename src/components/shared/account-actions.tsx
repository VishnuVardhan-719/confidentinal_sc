"use client";

import { ArrowLeftRight, ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
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
    <form action={account.signOutAction} method={typeof account.signOutAction === "string" ? "post" : undefined}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant={mobile ? "secondary" : "quiet"} size={mobile ? "lg" : "icon"} className={mobile ? "w-full" : undefined} title={mobile ? undefined : t("account.signOut")}>
        <LogOut aria-hidden />
        {/* Desktop header is icon-only (no room for long Telugu/Hindi labels); the name stays for AT. */}
        <span className={mobile ? undefined : "sr-only"}>{t("account.signOut")}</span>
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
          <DropdownMenuTrigger title={t("account.switch")} className="inline-flex min-h-target min-w-target items-center justify-center gap-0.5 rounded-md px-2 text-ink hover:bg-mist data-[state=open]:bg-mist">
            <ArrowLeftRight aria-hidden className="size-4.5 text-forest" />
            <span className="sr-only">{t("account.switch")}</span>
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
