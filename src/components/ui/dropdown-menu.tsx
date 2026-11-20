"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

/**
 * Non-modal by default: a modal Radix menu sets aria-hidden on the rest of the page while its links
 * stay focusable (axe aria-hidden-focus). Non-modal follows the APG menu-button pattern: Escape or
 * Tab closes the menu and focus returns to the trigger. Pass modal explicitly to override.
 */
export function DropdownMenu({ modal = false, ...props }: ComponentPropsWithRef<typeof Menu.Root>) {
  return <Menu.Root modal={modal} {...props} />;
}
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentPropsWithRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 rounded-md border border-border bg-surface p-1.5 text-ink shadow-overlay",
          "motion-safe:data-[state=open]:animate-[scv-fade_var(--scv-duration-fast)_var(--scv-ease-out)]",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentPropsWithRef<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex min-h-target cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-base outline-none select-none",
        "data-highlighted:bg-mist data-highlighted:text-forest data-disabled:text-disabled-text",
        // Keyboard focus needs more than a pale background change (WCAG 2.4.7 / 1.4.11).
        "focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-focus",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithRef<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-3 py-2 text-sm font-semibold text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentPropsWithRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
