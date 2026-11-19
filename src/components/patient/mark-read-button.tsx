"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/inline-error";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";

/** Marks the given notifications read on the server, then refetches. Never marks locally first. */
export function MarkReadButton({ ids, markRead }: { ids: string[]; markRead: (ids: string[]) => Promise<ApiResult<{ updated: number }>> }) {
  const t = useTranslations("patient.notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await markRead(ids);
      if (!r.ok) return setError(r.error.code);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button variant="secondary" onClick={run} disabled={busy || pending || ids.length === 0} aria-busy={busy || pending}>
        <CheckCheck aria-hidden />
        {t("markAllRead")}
      </Button>
      {error ? <InlineError code={error} /> : null}
    </div>
  );
}
