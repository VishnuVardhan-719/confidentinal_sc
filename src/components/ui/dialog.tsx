"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

/**
 * Accessible modal dialog (Radix): focus trap, Escape closes, focus returns to the trigger.
 * Every dialog must render a DialogTitle; add DialogDescription for the consequence.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-ink/45 motion-safe:data-[state=open]:animate-[scv-fade_var(--scv-duration)_var(--scv-ease-out)]",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  const t = useTranslations("accessibility");
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-1/2 gap-4 overflow-y-auto",
          "rounded-lg bg-surface p-6 text-ink shadow-overlay",
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute top-3 right-3 inline-flex size-target items-center justify-center rounded-md text-muted hover:bg-mist hover:text-ink"
            aria-label={t("close")}
          >
            <X aria-hidden className="size-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-10 font-display text-xl font-semibold text-ink", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-base text-muted", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end", className)} {...props} />;
}
