"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

export const DropdownMenu = Menu.Root;
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
