"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InlineError } from "./inline-error";

export type ConfirmResult = { ok: true } | { ok: false; code?: string };

/**
 * Explicit confirmation for a consequential action. Stays open while the action runs and shows an
 * inline error if it fails; closes only on server-confirmed success.
 *
 * `children` renders extra inputs (reason, acknowledgement) between the description and the buttons;
 * keep Confirm disabled via `confirmDisabled` until they are valid. `onOpenChange` lets the caller
 * reset that state whenever the dialog closes.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  confirmDisabled = false,
  onConfirm,
  onOpenChange,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  confirmDisabled?: boolean;
  onConfirm: () => Promise<ConfirmResult>;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const t = useTranslations("common.actions");
  const [open, setOpenState] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Single path for every open/close so the stale error is always cleared.
  function setOpen(next: boolean) {
    if (pending) return;
    setOpenState(next);
    if (!next) setErrorCode(null);
    onOpenChange?.(next);
  }

  async function confirm() {
    if (confirmDisabled) return;
    setPending(true);
    setErrorCode(null);
    let closeAfter = false;
    try {
      const result = await onConfirm();
      if (result.ok) closeAfter = true;
      else setErrorCode(result.code ?? "generic");
    } catch {
      setErrorCode("unavailable");
    } finally {
      setPending(false);
    }
    if (closeAfter) {
      setOpenState(false);
      onOpenChange?.(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent role="alertdialog" hideClose={pending}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div>{description}</div>
        </DialogDescription>
        {children}
        {errorCode ? <InlineError code={errorCode} /> : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={confirm}
            disabled={pending || confirmDisabled}
            aria-busy={pending}
          >
            {pending ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
