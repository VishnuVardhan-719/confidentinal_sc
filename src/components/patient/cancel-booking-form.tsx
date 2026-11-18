"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, type ConfirmResult } from "@/components/shared/confirm-dialog";
import { Notice } from "@/components/shared/notice";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";

/**
 * Patient cancellation request. The browser sends only the booking id and the version it saw;
 * the server checks ownership, state and the cancellation window and may refuse (conflict).
 * Closes only on a server-confirmed result.
 */
export function CancelBookingForm({
  bookingId,
  expectedVersion,
  policyApplies,
  serverGranted,
  cancel,
}: {
  bookingId: string;
  expectedVersion: number;
  policyApplies: boolean;
  /** True when the server reported a cancel grant; otherwise the request may still be refused. */
  serverGranted: boolean;
  cancel: (bookingId: string, expectedVersion: number) => Promise<ApiResult<{ version: number }>>;
}) {
  const t = useTranslations("patient.booking.cancel");
  const router = useRouter();
  const ackId = useId();
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState(false);

  async function onConfirm(): Promise<ConfirmResult> {
    const r = await cancel(bookingId, expectedVersion);
    if (!r.ok) return { ok: false, code: r.error.code };
    setDone(true);
    router.refresh();
    return { ok: true };
  }

  if (done) {
    return (
      <Notice tone="info" title={t("doneTitle")} role="status">
        {t("doneBody")}
      </Notice>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-muted">{policyApplies ? t("policyBody") : t("body")}</p>
      {serverGranted ? null : <p className="text-sm text-muted">{t("serverDecides")}</p>}
      <div>
        <ConfirmDialog
          trigger={<Button variant="secondary">{t("trigger")}</Button>}
          title={t("confirmTitle")}
          description={t("confirmBody")}
          confirmLabel={t("confirm")}
          cancelLabel={t("keep")}
          tone="danger"
          confirmDisabled={!ack}
          onConfirm={onConfirm}
          onOpenChange={(open) => {
            if (!open) setAck(false);
          }}
        >
          <div className="flex items-start gap-3">
            <Checkbox id={ackId} checked={ack} onCheckedChange={(v) => setAck(v === true)} />
            <label htmlFor={ackId} className="text-sm leading-6">
              {t("ack")}
            </label>
          </div>
        </ConfirmDialog>
      </div>
    </div>
  );
}
