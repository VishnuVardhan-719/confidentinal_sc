"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";
import { DialogOverlay } from "./dialog";

/** Side drawer built on Radix Dialog: focus trap, Escape closes, focus returns to the trigger. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const sideClass = {
  right: "inset-y-0 right-0 h-dvh w-[min(22rem,88vw)] motion-safe:data-[state=open]:animate-[scv-slide-in-right_var(--scv-duration)_var(--scv-ease-out)]",
  left: "inset-y-0 left-0 h-dvh w-[min(22rem,88vw)] motion-safe:data-[state=open]:animate-[scv-slide-in-left_var(--scv-duration)_var(--scv-ease-out)]",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg motion-safe:data-[state=open]:animate-[scv-slide-in-up_var(--scv-duration)_var(--scv-ease-out)]",
} as const;

export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Content> & { side?: keyof typeof sideClass }) {
  const t = useTranslations("accessibility");
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-y-auto overscroll-contain bg-paper text-ink shadow-overlay",
          "pb-[env(safe-area-inset-bottom)]",
          sideClass[side],
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Close
          className="absolute top-3 right-3 z-10 inline-flex size-target items-center justify-center rounded-md text-muted hover:bg-mist hover:text-ink"
          aria-label={t("close")}
        >
          <X aria-hidden className="size-5" />
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
