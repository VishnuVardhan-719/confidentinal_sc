"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineError } from "@/components/shared/inline-error";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { REJECTION_REASONS, type ModerationItem, type RejectionReason } from "@/modules/reviews/types";

/**
 * Publish (one click, reversible only by the backend) or "do not publish" with a required reason in a
 * confirm dialog. After the server confirms, the page reloads with a status message; a stale version
 * shows the conflict copy and refreshes the list.
 */
export function ModerationActions({
  reviewId,
  reference,
  version,
  decide,
}: {
  reviewId: string;
  reference: string;
  version: number;
  decide: (reviewId: string, decision: unknown, version: number) => Promise<ApiResult<ModerationItem>>;
}) {
  const t = useTranslations("admin.reviews");
  const router = useRouter();
  const selectId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<RejectionReason | "">("");

  const done = (status: "published" | "rejected" | "conflict") => {
    router.replace(`/admin/reviews?done=${status}`, { scroll: false });
    router.refresh();
  };

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await decide(reviewId, { decision: "publish" }, version);
      if (!r.ok) return r.error.code === "conflict" ? done("conflict") : setError(r.error.code);
      done("published");
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={publish} disabled={busy} aria-busy={busy} aria-label={t("publishLabel", { reference })}>
          <Check aria-hidden />
          {busy ? t("working") : t("publish")}
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="secondary" disabled={busy} aria-label={t("rejectLabel", { reference })}>
              <X aria-hidden />
              {t("reject")}
            </Button>
          }
          title={t("rejectTitle")}
          description={t("rejectBody")}
          confirmLabel={t("confirmReject")}
          cancelLabel={t("cancel")}
          tone="danger"
          confirmDisabled={reason === ""}
          onOpenChange={(open) => {
            if (!open) setReason("");
          }}
          onConfirm={async () => {
            const r = await decide(reviewId, { decision: "reject", reason }, version);
            if (!r.ok) {
              if (r.error.code === "conflict") {
                done("conflict");
                return { ok: true };
              }
              return { ok: false, code: r.error.code };
            }
            done("rejected");
            return { ok: true };
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={selectId} className="text-base font-semibold text-ink">
              {t("reasonLabel")}
            </label>
            <select id={selectId} className={fieldControlClass} value={reason} onChange={(e) => setReason(e.target.value as RejectionReason | "")} aria-required>
              <option value="">{t("reasonPlaceholder")}</option>
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </select>
          </div>
        </ConfirmDialog>
      </div>
      {error ? <InlineError code={error} /> : null}
    </div>
  );
}
