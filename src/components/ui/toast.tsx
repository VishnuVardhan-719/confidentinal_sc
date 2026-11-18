"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Transient, non-critical confirmations only. Consequential errors and anything the user must act on
 * stay inline on the page (FRONTEND_MASTER section 7). Never put health data or IDs in a toast.
 */
export type ToastTone = "info" | "success" | "warning";
export type ToastInput = { title: string; description?: string; tone?: ToastTone };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const toneIcon = { info: Info, success: CheckCircle2, warning: TriangleAlert } as const;
const toneClass = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning-text",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("accessibility");
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((input: ToastInput) => {
    setItems((prev) => [...prev.slice(-2), { ...input, id: nextId.current++ }]);
  }, []);
  const remove = useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={6000} label={t("notifications")}>
        {children}
        {items.map((item) => {
          const tone = item.tone ?? "info";
          const Icon = toneIcon[tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              onOpenChange={(open) => (open ? undefined : remove(item.id))}
              className="relative flex gap-3 rounded-md border border-border bg-surface p-4 pr-12 text-ink shadow-overlay motion-safe:data-[state=open]:animate-[scv-slide-in-up_var(--scv-duration)_var(--scv-ease-out)]"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", toneClass[tone])} />
              <div className="grid gap-1">
                <ToastPrimitive.Title className="font-semibold">{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-sm text-muted">{item.description}</ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label={t("dismiss")}
                className="absolute top-2 right-2 inline-flex size-target items-center justify-center rounded-md text-muted hover:bg-mist hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[60] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none sm:right-4 sm:bottom-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
