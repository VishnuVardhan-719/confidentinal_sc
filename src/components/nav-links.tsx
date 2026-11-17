"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type NavItem = { href: string; label: string };

/**
 * aria-current value for a nav link: "page" on an exact match, "true" when the
 * current page sits inside the link's section, otherwise undefined. "/" only matches itself.
 */
export function ariaCurrentFor(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (href !== "/" && pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

type NavLinksProps = {
  items: readonly NavItem[];
  label: string;
  id?: string;
  className?: string;
  onNavigate?: () => void;
};

/** Navigation links that mark the current section with aria-current. */
export function NavLinks({ items, label, id, className = "site-nav", onNavigate }: NavLinksProps) {
  const pathname = usePathname() ?? "/";
  return (
    <nav id={id} className={className} aria-label={label}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={ariaCurrentFor(pathname, item.href)} onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Header navigation. From 48rem up the links are always shown. Below that they collapse behind a
 * disclosure button (aria-expanded/aria-controls). The panel is in normal flow, so no focus trap or
 * scroll lock is needed. Escape closes it and returns focus to the button; navigating closes it.
 * Without JavaScript the links stay visible (see the noscript rule).
 */
export function HeaderNav({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname() ?? "/";
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The menu remembers the path it was opened on, so any route change closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      const focusWasInMenu =
        active === null ||
        active === document.body ||
        active === buttonRef.current ||
        (panelRef.current?.contains(active) ?? false);
      setOpenedOn(null);
      // Do not pull focus away from an unrelated control the user has moved to.
      if (focusWasInMenu) buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <noscript>
        <style>{".site-header .menu-toggle{display:none}.site-header .nav-panel{display:block}"}</style>
      </noscript>
      <button
        ref={buttonRef}
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenedOn(open ? null : pathname)}
      >
        <span className="menu-icon" aria-hidden="true">
          <span />
        </span>
        Menu
      </button>
      <div ref={panelRef} className="nav-panel" id={panelId} data-open={open}>
        <NavLinks items={items} label={label} className="site-nav" onNavigate={() => setOpenedOn(null)} />
      </div>
    </>
  );
}
