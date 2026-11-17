"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DemoRole } from "@/lib/demo/data";
import { cx } from "@/components/ui/cx";
import { Icon } from "./icons";
import { NAV_BY_ROLE, ROLE_LABEL, SIGN_OUT, currentHref, type AppNavItem } from "./nav-model";

/**
 * One nav landmark for the app area, for the signed-in demo role. From 48rem it is a sticky sidebar;
 * below that it is a bottom bar that sticks to the viewport and rests above the site footer.
 * With no session it renders only a sign-in link (the page itself redirects to /sign-in).
 */
export function AppNav({ role, name }: { role: DemoRole | null; name?: string }) {
  const pathname = usePathname() ?? "/";
  const items: readonly AppNavItem[] = role
    ? [...NAV_BY_ROLE[role], SIGN_OUT]
    : [{ href: "/sign-in", label: "Sign in", short: "Sign in", icon: "user" }];
  const current = currentHref(pathname, items);

  return (
    <nav
      aria-label={role ? `${ROLE_LABEL[role]} area` : "App"}
      className={cx(
        "sticky bottom-0 z-20 order-last -mx-5 border-t border-[var(--line)] bg-[var(--paper-raised)] pb-[env(safe-area-inset-bottom)]",
        "md:order-none md:mx-0 md:self-start md:border-t-0 md:border-r md:bg-transparent md:pb-0 md:pr-6 md:top-0 md:bottom-auto md:py-10",
      )}
    >
      {role ? (
        <div className="hidden px-3 pb-4 md:block">
          <p className="text-[0.8125rem] font-semibold text-[var(--ink-soft)]">{ROLE_LABEL[role]}</p>
          {name ? <p className="mt-0.5 text-[0.9375rem] font-semibold break-words text-[var(--ink)]">{name}</p> : null}
        </div>
      ) : null}
      <ul className="m-0 flex list-none p-0 md:flex-col md:gap-1">
        {items.map((item) => {
          const active = item.href === current;
          const signOut = item.href === SIGN_OUT.href;
          return (
            <li key={item.href} className={cx("flex-1 md:flex-none", signOut && "md:mt-4 md:border-t md:border-[var(--line)] md:pt-4")}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.75rem] font-semibold no-underline",
                  "md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-[0.9375rem]",
                  "transition-colors duration-150 motion-reduce:transition-none",
                  "focus-visible:outline-offset-[-3px] md:focus-visible:outline-offset-2",
                  active
                    ? "text-[var(--forest)] md:bg-[var(--mist)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--forest)] md:text-[var(--ink)] md:hover:bg-[var(--mist)]",
                )}
              >
                <span
                  className={cx(
                    "grid h-7 w-12 place-items-center rounded-full md:h-auto md:w-auto",
                    active && "bg-[var(--mist)] md:bg-transparent",
                  )}
                >
                  <Icon name={item.icon} className="size-5" />
                </span>
                <span className="md:hidden">{item.short}</span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
