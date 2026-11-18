"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmResult } from "@/components/shared/confirm-dialog";
import { Notice } from "@/components/shared/notice";
import { formatPaise, isValidPaise } from "./money";

export const CANCELLATION_REASONS = ["schedule_change", "no_longer_needed", "chose_other_provider", "other"] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/**
 * The server's approved cancellation terms for THIS booking. If the server cannot supply an approved
 * policy version, pass `{ state: "unavailable" }`: the dialog then fails closed (no cancel action).
 */
export type CancellationPolicyView =
  | {
      state: "approved";
      /** Policy version the server will apply; sent back with the request. */
      version: string;
      /** Server-provided, already-localized plain-text summary of the terms. */
      summary: string;
      /** Fee in paise per the approved terms (0 = no fee). */
      feePaise: number;
      /** Amount the server will refund to an online payment, or null when nothing was paid online. */
      refundPaise: number | null;
    }
  | { state: "unavailable" };

export type CancellationInput = { reason: CancellationReason; policyVersion: string };

export function isCancellationReady(policy: CancellationPolicyView, reason: CancellationReason | null, acknowledged: boolean): boolean {
  return policy.state === "approved" && isValidPaise(policy.feePaise) && reason !== null && acknowledged;
}

/**
 * Cancel-a-booking confirmation (client island; wrap in <IntlScope namespaces={["payment"]}>).
 * Shows only server-approved terms and amounts, needs a reason and an explicit acknowledgement, and
 * closes only after the server confirms. Fails closed without an approved policy.
 */
export function CancellationDialog({
  policy,
  onConfirm,
  trigger,
}: {
  policy: CancellationPolicyView;
  onConfirm: (input: CancellationInput) => Promise<ConfirmResult>;
  trigger?: ReactNode;
}) {
  const t = useTranslations("payment.cancellation");
  const locale = useLocale();
  const id = useId();
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const approved = policy.state === "approved" && isValidPaise(policy.feePaise);
  const ready = isCancellationReady(policy, reason, acknowledged);

  function reset(open: boolean) {
    if (!open) {
      setReason(null);
      setAcknowledged(false);
    }
  }

  return (
    <ConfirmDialog
      trigger={trigger ?? <Button variant="secondary">{t("trigger")}</Button>}
      title={t("title")}
      description={approved ? t("description") : t("unavailableDescription")}
      confirmLabel={t("confirm")}
      cancelLabel={t("keep")}
      tone="danger"
      confirmDisabled={!ready}
      onOpenChange={reset}
      onConfirm={() =>
        ready && policy.state === "approved" && reason
          ? onConfirm({ reason, policyVersion: policy.version })
          : Promise.resolve({ ok: false, code: "validation" })
      }
    >
      {approved && policy.state === "approved" ? (
        <div className="grid gap-5">
          <div className="grid gap-2 rounded-md bg-paper p-4">
            <p className="text-sm font-semibold text-ink">{t("termsTitle", { version: policy.version })}</p>
            <p className="text-base whitespace-pre-line text-ink">{policy.summary}</p>
            <dl className="mt-1 grid gap-1 text-base tabular">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("fee")}</dt>
                <dd className="font-semibold text-ink">{policy.feePaise === 0 ? t("noFee") : formatPaise(policy.feePaise, locale)}</dd>
              </div>
              {policy.refundPaise !== null && isValidPaise(policy.refundPaise) ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("refund")}</dt>
                  <dd className="font-semibold text-ink">{formatPaise(policy.refundPaise, locale)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-base font-semibold text-ink">{t("reasonLegend")}</legend>
            {CANCELLATION_REASONS.map((r) => (
              <label key={r} htmlFor={`${id}-${r}`} className="flex min-h-target cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-mist">
                <input
                  id={`${id}-${r}`}
                  type="radio"
                  name={`${id}-reason`}
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="size-5 accent-forest"
                />
                <span className="text-base text-ink">{t(`reasons.${r}`)}</span>
              </label>
            ))}
          </fieldset>

          <label htmlFor={`${id}-ack`} className="flex min-h-target cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-mist">
            <input
              id={`${id}-ack`}
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-forest"
            />
            <span className="text-base text-ink">{t("acknowledge", { version: policy.version })}</span>
          </label>
          {!ready ? (
            <p className="text-sm text-muted" aria-live="polite">
              {t("incomplete")}
            </p>
          ) : null}
        </div>
      ) : (
        <Notice tone="warning" title={t("unavailableTitle")}>
          {t("unavailableBody")}
        </Notice>
      )}
    </ConfirmDialog>
  );
}
