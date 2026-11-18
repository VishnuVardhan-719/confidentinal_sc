"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldControlClass } from "@/components/ui/input";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { StatusBadge } from "@/components/shared/status-badge";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { newIntentKey } from "@/modules/clinical/finalize-flow";
import { COLLECTION_METHOD_MAP, describeCollectionStatus } from "@/modules/records/status";
import { COLLECTION_METHODS, collectionInputSchema, type CollectionInput, type CollectionMethod, type CollectionView } from "@/modules/records/types";
import { badgeFor, parseRupeesToPaise } from "./kit";
import { useClinicalFormat } from "./use-format";

/**
 * DC10 provider-recorded cash / direct-UPI collection. Separate from the gateway payment state
 * (shown as its own badge by the page) and from clinical finalization.
 */
export function CollectionForm({
  bookingId,
  view,
  canRecord,
  record,
}: {
  bookingId: string;
  view: CollectionView;
  canRecord: boolean;
  record: (bookingId: string, input: CollectionInput, key: string) => Promise<ApiResult<CollectionView>>;
}) {
  const t = useTranslations("clinical.collection");
  const tc = useTranslations("common.actions");
  const { tk, money, dateTime } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const ids = { method: useId(), amount: useId(), reference: useId() };
  const [method, setMethod] = useState<CollectionMethod | "">("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One idempotency key per intent; kept across retries, reset after success.
  const key = useRef<string | null>(null);

  const fieldError = (id: string) => errors.find((e) => e.fieldId === id)?.message;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: SummaryError[] = [];
    const paise = parseRupeesToPaise(amount);
    if (!method) next.push({ fieldId: ids.method, message: t("methodPlaceholder") });
    if (paise === null) next.push({ fieldId: ids.amount, message: t("amountInvalid") });
    if (method === "upi_direct" && !reference.trim()) next.push({ fieldId: ids.reference, message: t("referenceRequired") });
    const candidate = { method, amountPaise: paise ?? 0, ...(reference.trim() ? { reference: reference.trim() } : {}) };
    const parsed = collectionInputSchema.safeParse(candidate);
    if (next.length === 0 && !parsed.success) next.push({ fieldId: ids.reference, message: t("referenceHint") });
    setErrors(next);
    setAttempt((a) => a + 1);
    if (next.length > 0 || !parsed.success) return;
    setBusy(true);
    setApiError(null);
    key.current ??= newIntentKey();
    try {
      const r = await record(bookingId, parsed.data, key.current);
      if (!r.ok) {
        setApiError(r.error.code);
        return;
      }
      key.current = null;
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${ids.method}-title`} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${ids.method}-title`} className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        <StatusBadge {...badgeFor(describeCollectionStatus(view.status), tk)} />
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {view.record ? (
        <p className="font-medium text-ink tabular">
          {t("recorded", { amount: money(view.record.amountPaise), method: tk(COLLECTION_METHOD_MAP[view.record.method].labelKey), time: dateTime(view.record.collectedAt) })}
        </p>
      ) : !canRecord ? (
        <p className="text-muted">{t("notAvailable")}</p>
      ) : (
        <form onSubmit={submit} noValidate className="grid max-w-form gap-5">
          <ErrorSummary errors={errors} focusKey={attempt} />
          <Field id={ids.method} label={t("methodLabel")} required error={fieldError(ids.method)}>
            {(control) => (
              <select {...control} className={fieldControlClass} value={method} onChange={(e) => setMethod(e.target.value as CollectionMethod | "")}>
                <option value="">{t("methodPlaceholder")}</option>
                {COLLECTION_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tk(COLLECTION_METHOD_MAP[m].labelKey)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={ids.amount} label={t("amount")} hint={t("amountHint", { amount: money(view.amountDuePaise) })} required error={fieldError(ids.amount)}>
            {(control) => <Input {...control} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-48 tabular" />}
          </Field>
          {method === "upi_direct" ? (
            <Field id={ids.reference} label={t("reference")} hint={t("referenceHint")} required error={fieldError(ids.reference)}>
              {(control) => <Input {...control} autoComplete="off" maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />}
            </Field>
          ) : null}
          {apiError ? <InlineError code={apiError} /> : null}
          <div>
            <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
              {busy ? tc("working") : t("submit")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
