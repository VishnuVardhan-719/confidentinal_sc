"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * Retry a failed load. With no `onRetry`, re-fetches the current route's server data.
 * Shows pending state; never reports success on its own.
 */
export function RetryAction({ onRetry, label }: { onRetry?: () => unknown | Promise<unknown>; label?: string }) {
  const t = useTranslations("common.actions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const busy = pending || running;

  async function handle() {
    if (onRetry) {
      setRunning(true);
      try {
        await onRetry();
      } finally {
        setRunning(false);
      }
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button variant="secondary" onClick={handle} disabled={busy} aria-busy={busy}>
      <RotateCw aria-hidden className={busy ? "motion-safe:animate-spin" : undefined} />
      {busy ? t("retrying") : (label ?? t("retry"))}
    </Button>
  );
}
