"use client";

import {
  Ambulance,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  HandHeart,
  House,
  Inbox,
  LifeBuoy,
  MapPinned,
  Menu,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";
import { LocaleSwitcher } from "./locale-switcher";
import { isActivePath } from "./nav-match";
import { MAIN_CONTENT_ID } from "./skip-link";

const ICONS = {
  home: House,
  calendar: CalendarDays,
  inbox: Inbox,
  users: Users,
  user: UserRound,
  file: FileText,
  settings: Settings,
  wallet: Wallet,
  bell: Bell,
  support: LifeBuoy,
  clipboard: ClipboardList,
  map: MapPinned,
  ambulance: Ambulance,
  flask: FlaskConical,
  stethoscope: Stethoscope,
  care: HandHeart,
  shield: ShieldCheck,
  building: Building2,
} satisfies Record<string, LucideIcon>;

export type ShellIcon = keyof typeof ICONS;

export type ShellNavItem = {
  /** Locale-less path, e.g. "/patient/bookings". */
  href: string;
  /** Already-localized label. */
  label: string;
  icon: ShellIcon;
  /** Shown in the mobile bottom bar (max 5; extras stay in the menu). */
  primary?: boolean;
  /** Server-derived count only (e.g. unread). Never fabricated. */
  count?: number;
};

/**
 * Authenticated workspace shell. Role pages supply nav config; authorization is enforced on the
 * server, never by which items are shown here.
 */
export function AppShell({
  workspaceLabel,
  nav,
  topbarTitle,
  topbarActions,
  sidebarFooter,
  children,
}: {
  workspaceLabel: string;
  nav: ShellNavItem[];
  topbarTitle?: ReactNode;
  topbarActions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const ta = useTranslations("accessibility");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = nav.filter((n) => n.primary).slice(0, 5);
  // The first item is usually the dashboard root; match it exactly so it is not always active.
  const active = (item: ShellNavItem, i: number) => isActivePath(pathname, item.href, i === 0);

  const navList = (onNavigate?: boolean) => (
    <ul className="grid gap-0.5">
      {nav.map((item, i) => {
        const Icon = ICONS[item.icon];
        const link = (
          <Link
            href={item.href}
            aria-current={active(item, i) ? "page" : undefined}
            className={cn(
              "flex min-h-target items-center gap-3 rounded-md px-3 text-base text-ink hover:bg-mist",
              "aria-[current=page]:bg-mist aria-[current=page]:font-semibold aria-[current=page]:text-forest",
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.9} />
            <span className="flex-1 truncate">{item.label}</span>
            {typeof item.count === "number" && item.count > 0 ? (
              <>
                <span aria-hidden className="rounded-full bg-forest px-2 text-sm font-semibold text-on-forest tabular">
                  {item.count}
                </span>
                <span className="sr-only">{ta("unreadCount", { count: item.count })}</span>
              </>
            ) : null}
          </Link>
        );
        return <li key={item.href}>{onNavigate ? <SheetClose asChild>{link}</SheetClose> : link}</li>;
      })}
    </ul>
  );

  return (
    <div className="flex min-h-dvh bg-paper">
      <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="px-4 py-4">
          <BrandLogo />
          <p className="mt-1 pl-1 text-sm font-medium text-muted">{workspaceLabel}</p>
        </div>
        <nav aria-label={ta("sidebarNavigation")} className="flex-1 overflow-y-auto px-3 py-2">
          {navList()}
        </nav>
        {sidebarFooter ? <div className="border-t border-border p-3">{sidebarFooter}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-paper/95 px-4 backdrop-blur-sm sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="quiet" size="icon" className="-ml-2 lg:hidden" aria-label={ta("openMenu")}>
                <Menu aria-hidden className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" aria-describedby="shell-menu-desc">
              <div className="grid gap-4 p-4 pt-6">
                <SheetTitle className="pr-12 font-display text-xl font-semibold">{workspaceLabel}</SheetTitle>
                <SheetDescription id="shell-menu-desc" className="sr-only">
                  {ta("menuDescription")}
                </SheetDescription>
                <nav aria-label={ta("sidebarNavigation")}>{navList(true)}</nav>
                <div className="border-t border-border pt-3">
                  <LocaleSwitcher variant="inline" />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 truncate font-semibold text-ink">{topbarTitle}</div>
          <LocaleSwitcher className="hidden sm:inline-flex" />
          {topbarActions}
        </header>

        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 px-4 py-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>

        {primary.length > 0 ? (
          <nav
            aria-label={ta("mobileNavigation")}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}>
              {primary.map((item) => {
                const Icon = ICONS[item.icon];
                const isActive = active(item, nav.indexOf(item));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-muted aria-[current=page]:text-forest"
                    >
                      <Icon aria-hidden className="size-5" strokeWidth={isActive ? 2.4 : 1.9} />
                      <span className="max-w-full truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
