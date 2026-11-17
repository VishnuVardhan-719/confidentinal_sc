"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation links that mark the current section with aria-current. */
export function NavLinks({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="site-nav" aria-label={label}>
      {items.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? (pathname === item.href ? "page" : "true") : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
