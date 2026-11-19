"use client";

import { ChevronDown, MapPin, Menu, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SERVICES } from "@/components/public/routes";
import { Link, usePathname } from "@/i18n/navigation";
import { AccountActions } from "./account-actions";
import { BrandLogo } from "./brand-logo";
import type { PublicAccount } from "./session-seam";
import { LocaleSwitcher } from "./locale-switcher";
import { ServiceIcon } from "./service-icon";

const PRIMARY_LINKS = [
  { key: "findDoctors", href: "/doctors" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "about", href: "/about" },
  { key: "stories", href: "/stories" },
] as const;

const navLinkClass =
  "inline-flex min-h-target items-center rounded-md px-2.5 text-base font-medium whitespace-nowrap text-ink hover:bg-mist 2xl:px-3 aria-[current=page]:text-forest aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8";

/**
 * Public site header. `account`: undefined while the session loads, null when signed out, or the
 * signed-in account (role-aware dashboard links + sign out). Supplied by <PublicHeaderWithAccount/>.
 */
export function PublicHeader({ account }: { account?: PublicAccount | null }) {
  const t = useTranslations("common");
  const ta = useTranslations("accessibility");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-paper/95 backdrop-blur-sm supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-content items-center gap-2 px-4 sm:px-6 xl:h-[4.5rem] lg:px-8">
        <BrandLogo className="mr-auto xl:mr-3 2xl:mr-6" />

        <nav aria-label={ta("mainNavigation")} className="hidden items-center gap-0.5 xl:flex 2xl:gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(navLinkClass, "gap-1.5 data-[state=open]:bg-mist")}>
              {t("nav.services")}
              <ChevronDown aria-hidden className="size-4 text-muted" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {SERVICES.map((s) => (
                <DropdownMenuItem key={s.key} asChild>
                  <Link href={s.href}>
                    <ServiceIcon name={s.icon} className="size-5 text-forest" />
                    <span className="grid">
                      <span className="font-medium">{t(`services.${s.key}.label`)}</span>
                      <span className="text-sm text-muted">{t(`services.${s.key}.short`)}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {PRIMARY_LINKS.map((l) => (
            <Link key={l.key} href={l.href} aria-current={current(l.href)} className={navLinkClass}>
              {t(`nav.${l.key}`)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/emergency"
            className="inline-flex min-h-target items-center gap-2 rounded-md px-2.5 font-semibold whitespace-nowrap text-danger hover:bg-danger-surface"
          >
            <Phone aria-hidden className="size-4.5" />
            <span className="hidden sm:inline xl:hidden 2xl:inline">{t("nav.emergency")}</span>
            <span className="sm:hidden xl:inline 2xl:hidden" aria-hidden>
              112
            </span>
            <span className="sr-only sm:hidden xl:inline 2xl:hidden">{t("nav.emergencyLong")}</span>
          </Link>
          <Link href="/#finder" className={cn(navLinkClass, "hidden gap-2 2xl:inline-flex")}>
            <MapPin aria-hidden className="size-4.5 text-forest" />
            {t("nav.location")}
          </Link>
          <LocaleSwitcher className="hidden xl:inline-flex" />
          <div className="hidden pl-2 xl:block">
            <AccountActions account={account} variant="desktop" />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="quiet" size="icon" className="xl:hidden" aria-label={ta("openMenu")}>
                <Menu aria-hidden className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" aria-describedby="mobile-menu-desc">
              <div className="grid gap-6 p-5 pt-6">
                <SheetTitle className="font-display text-xl font-semibold">{t("nav.menu")}</SheetTitle>
                <SheetDescription id="mobile-menu-desc" className="sr-only">
                  {ta("menuDescription")}
                </SheetDescription>
                <nav aria-label={ta("mainNavigation")} className="grid gap-6">
                  <div className="grid gap-1">
                    <p className="text-sm font-semibold text-muted">{t("nav.services")}</p>
                    <ul className="grid">
                      {SERVICES.map((s) => (
                        <li key={s.key}>
                          <SheetClose asChild><Link href={s.href} className="flex min-h-12 items-center gap-3 rounded-md px-2 text-lg hover:bg-mist">
                            <ServiceIcon name={s.icon} className="size-5 text-forest" />
                            {t(`services.${s.key}.label`)}
                          </Link></SheetClose>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ul className="grid border-t border-border pt-4">
                    {PRIMARY_LINKS.map((l) => (
                      <li key={l.key}>
                        <SheetClose asChild><Link href={l.href} aria-current={current(l.href)} className="flex min-h-12 items-center rounded-md px-2 text-lg hover:bg-mist aria-[current=page]:font-semibold aria-[current=page]:text-forest">
                          {t(`nav.${l.key}`)}
                        </Link></SheetClose>
                      </li>
                    ))}
                    <li>
                      <SheetClose asChild><Link href="/#finder" className="flex min-h-12 items-center gap-2 rounded-md px-2 text-lg hover:bg-mist">
                        <MapPin aria-hidden className="size-5 text-forest" />
                        {t("nav.location")}
                      </Link></SheetClose>
                    </li>
                  </ul>
                  <div className="border-t border-border pt-4">
                    <AccountActions account={account} variant="mobile" />
                  </div>
                </nav>
                <div className="grid gap-2 border-t border-border pt-4">
                  <LocaleSwitcher variant="inline" />
                </div>
                <SheetClose asChild><Link
                  href="/emergency"
                  className="flex min-h-12 items-center gap-2 rounded-md border border-danger/30 bg-danger-surface px-3 font-semibold text-danger"
                >
                  <Phone aria-hidden className="size-5" />
                  {t("nav.emergencyLong")}
                </Link></SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
