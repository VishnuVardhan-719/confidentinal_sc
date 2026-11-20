"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ApiResult } from "@/lib/api/result";
import { describePhotoConsent, describePhotoScan } from "@/modules/records/status";
import type { PhotoConsent, PhotoConsentInput, PhotoMeta } from "@/modules/records/types";
import { CheckField, LongTextField } from "./editor/fields";
import { badgeFor } from "./kit";
import { useClinicalFormat } from "./use-format";
import { useHydrated } from "./use-hydrated";
import { HydrationStatus, hydrationBusy } from "./hydration-status";

/**
 * DC13 optional photo consent. Recording consent or a decline never requests the camera; no file
 * picker is shown because private upload is not connected yet. Declining never blocks signing.
 */
export function PhotoConsentPanel({
  consultationId,
  initialConsent,
  photos,
  disabled,
  record,
}: {
  consultationId: string;
  initialConsent: PhotoConsent | null;
  photos: PhotoMeta[];
  disabled: boolean;
  record: (consultationId: string, input: PhotoConsentInput) => Promise<ApiResult<PhotoConsent>>;
}) {
  const t = useTranslations("clinical.photo");
  const tc = useTranslations("common.actions");
  const { tk, dateTime } = useClinicalFormat();
  const ids = { title: useId(), purpose: useId(), confirm: useId() };
  const [consent, setConsent] = useState(initialConsent);
  const [purpose, setPurpose] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ purpose?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function send(input: PhotoConsentInput) {
    setBusy(true);
    setError(null);
    try {
      const r = await record(consultationId, input);
      if (!r.ok) return setError(r.error.code);
      setConsent(r.data);
      // A recorded decision consumes this purpose/confirmation; a later photo needs fresh consent.
      setPurpose("");
      setConfirmed(false);
      setFieldErrors({});
    } finally {
      setBusy(false);
    }
  }

  function giveConsent() {
    const errs = {
      purpose: purpose.trim().length < 3 ? t("purposeRequired") : undefined,
      confirm: confirmed ? undefined : t("confirmRequired"),
    };
    setFieldErrors(errs);
    if (errs.purpose) return document.getElementById(ids.purpose)?.focus();
    if (errs.confirm) return document.getElementById(ids.confirm)?.focus();
    void send({ decision: "consent", purpose: purpose.trim(), patientConfirmed: true });
  }

  const visible = photos.filter((p) => !p.withdrawn);
  return (
    <section aria-labelledby={ids.title} className="grid gap-4" {...hydrationBusy(hydrated)}>
      <HydrationStatus hydrated={hydrated} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={ids.title} className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        {consent ? <StatusBadge {...badgeFor(describePhotoConsent(consent.decision), tk)} /> : null}
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {error ? <InlineError code={error} /> : null}
      <div aria-live="polite">
        {consent?.decision === "decline" ? <Notice tone="neutral">{t("declinedNote")}</Notice> : null}
        {consent?.decision === "withdrawn" ? <Notice tone="neutral">{t("withdrawnNote")}</Notice> : null}
      </div>

      {consent?.decision === "consent" ? (
        <div className="grid gap-3">
          <p className="text-ink">{consent.purpose}</p>
          <p className="text-sm text-muted">{t("uploadPending")}</p>
          {disabled ? null : (
            <div>
              <Button variant="secondary" disabled={busy || !hydrated} onClick={() => send({ decision: "withdrawn" })}>
                {busy ? tc("working") : t("withdraw")}
              </Button>
            </div>
          )}
        </div>
      ) : disabled ? null : (
        <div className="grid max-w-form gap-4">
          <LongTextField id={ids.purpose} label={t("purpose")} hint={t("purposeHint")} required rows={2} maxLength={500} value={purpose} onValue={setPurpose} error={fieldErrors.purpose} />
          <CheckField id={ids.confirm} label={t("patientConfirmed")} checked={confirmed} onChecked={setConfirmed} error={fieldErrors.confirm} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy || !hydrated} onClick={giveConsent}>
              {t("recordConsent")}
            </Button>
            <Button variant="quiet" disabled={busy || !hydrated} onClick={() => send({ decision: "decline" })}>
              {t("decline")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-base font-semibold text-ink">{t("photos")}</h3>
        {visible.length === 0 ? (
          <p className="text-sm text-muted">{t("noPhotos")}</p>
        ) : (
          <ul className="grid gap-1 text-sm tabular">
            {visible.map((p) => (
              <li key={p.photoId} className="flex flex-wrap items-center gap-2">
                <span>{dateTime(p.uploadedAt)}</span>
                <StatusBadge {...badgeFor(describePhotoScan(p.scanStatus), tk)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
