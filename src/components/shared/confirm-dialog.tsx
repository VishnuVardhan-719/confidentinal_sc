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
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<ConfirmResult>;
}) {
  const t = useTranslations("common.actions");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setErrorCode(null);
    try {
      const result = await onConfirm();
      if (result.ok) setOpen(false);
      else setErrorCode(result.code ?? "generic");
    } catch {
      setErrorCode("unavailable");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setErrorCode(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent role="alertdialog" hideClose={pending}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div>{description}</div>
        </DialogDescription>
        {errorCode ? <InlineError code={errorCode} /> : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} disabled={pending} aria-busy={pending}>
            {pending ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
