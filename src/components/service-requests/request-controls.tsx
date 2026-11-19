"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CancellationDialog } from "@/components/payments/cancellation-dialog";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";

/** Re-reads the request from the server. Status is never pushed or guessed in the browser. */
export function RefreshRequest({ updatedAt }: { updatedAt: string }) {
  const t = useTranslations("services.common.status");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending || undefined}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}{t("refresh")}
      </Button>
      <p className="text-sm text-muted tabular" aria-live="polite">{t("updatedAt", { time: updatedAt })}</p>
    </div>
  );
}

/**
 * Patient cancellation through the shared CancellationDialog (reason + terms acknowledgement, closes only after
 * the server confirms). Sends the version the page was rendered with; on a conflict the page reloads its data so
 * the patient sees what changed before trying again.
 */
export function CancelRequest({ id, version, cancel }: { id: string; version: number; cancel: (id: unknown, version: unknown) => Promise<ApiResult<{ version: number }>> }) {
  const t = useTranslations("services.common.status");
  const router = useRouter();
  const [done, setDone] = useState(false);
  return (
    <div className="grid gap-3">
      {done ? <Notice tone="info" title={t("cancelled")} role="status" /> : null}
      <div>
        <CancellationDialog
          policy={{ state: "approved", version: "synthetic-v1", summary: t("policySummary"), feePaise: 0, refundPaise: null }}
          trigger={<Button type="button" variant="secondary">{t("cancel")}</Button>}
          onConfirm={async () => {
            const result = await cancel(id, version).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
            if (!result.ok) { if (result.error.code === "conflict") router.refresh(); return { ok: false, code: result.error.code }; }
            setDone(true); router.refresh();
            return { ok: true };
          }}
        />
      </div>
    </div>
  );
}
