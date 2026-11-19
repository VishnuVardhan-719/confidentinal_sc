"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { validateReminderPrefs } from "@/modules/reminder-prefs/schemas";
import { spansMidnight } from "@/modules/reminder-prefs/status";
import { REMINDER_CHANNELS, REMINDER_ISSUES, type ReminderField, type ReminderIssue, type ReminderPrefs } from "@/modules/reminder-prefs/types";

const checkboxRow =
  "flex min-h-target cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 has-[:checked]:border-forest has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

/** Channel checkboxes and quiet hours (IST). Version-checked save; a stale version shows a reload prompt. */
export function ReminderForm({ prefs, save }: { prefs: ReminderPrefs; save: (input: unknown, version: number) => Promise<ApiResult<ReminderPrefs>> }) {
  const t = useTranslations("patientAccount.reminders");
  const router = useRouter();
  const base = useId();
  const ids: Record<ReminderField, string> = { quietStart: `${base}-start`, quietEnd: `${base}-end` };
  const [channels, setChannels] = useState(prefs.channels);
  const [quiet, setQuiet] = useState(prefs.quietHours);
  const [version, setVersion] = useState(prefs.version);
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const fieldError = (f: ReminderField) => errors.find((e) => e.fieldId === ids[f])?.message;
  const toSummary = (issues: { field: ReminderField; code: ReminderIssue }[]) => issues.map((i) => ({ fieldId: ids[i.field], message: t(`errors.${i.code}`) }));
  const allOff = REMINDER_CHANNELS.every((c) => !channels[c]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { channels, quietHours: quiet };
    const v = validateReminderPrefs(input);
    setAttempt((a) => a + 1);
    setApiError(null);
    setSaved(false);
    if (!v.ok) return setErrors(toSummary(v.issues));
    setErrors([]);
    setBusy(true);
    try {
      const r = await save(v.data, version);
      if (!r.ok) {
        const fields = r.error.fields ?? {};
        const issues = (Object.keys(ids) as ReminderField[])
          .filter((f) => (REMINDER_ISSUES as readonly string[]).includes(fields[f] ?? ""))
          .map((f) => ({ field: f, code: fields[f] as ReminderIssue }));
        if (r.error.code === "validation" && issues.length > 0) setErrors(toSummary(issues));
        else setApiError(r.error.code);
        return;
      }
      setVersion(r.data.version);
      setChannels(r.data.channels);
      setQuiet(r.data.quietHours);
      setSaved(true);
    } catch {
      setApiError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-form gap-8">
      <ErrorSummary errors={errors} focusKey={attempt} />

      <fieldset className="grid gap-3" aria-describedby={`${base}-channels-hint`}>
        <legend className="mb-1 font-display text-xl font-medium text-ink">{t("channelsLegend")}</legend>
        <p id={`${base}-channels-hint`} className="text-sm text-muted">
          {t("channelsHint")}
        </p>
        {REMINDER_CHANNELS.map((c) => (
          <label key={c} className={checkboxRow}>
            <input
              type="checkbox"
              name={`channel-${c}`}
              checked={channels[c]}
              onChange={(e) => {
                setSaved(false);
                setChannels((prev) => ({ ...prev, [c]: e.target.checked }));
              }}
              aria-describedby={`${base}-${c}-hint`}
              className="mt-0.5 size-5 shrink-0 accent-forest"
            />
            <span className="grid gap-0.5">
              <span className="font-semibold text-ink">{t(`channels.${c}`)}</span>
              <span id={`${base}-${c}-hint`} className="text-sm text-muted">
                {t(`channelHints.${c}`)}
              </span>
            </span>
          </label>
        ))}
        {allOff ? <Notice tone="warning">{t("allOff")}</Notice> : null}
      </fieldset>

      <fieldset className="grid gap-4" aria-describedby={`${base}-quiet-hint`}>
        <legend className="mb-1 font-display text-xl font-medium text-ink">{t("quietLegend")}</legend>
        <p id={`${base}-quiet-hint`} className="text-sm text-muted">
          {t("quietHint")}
        </p>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            name="quiet-enabled"
            checked={quiet.enabled}
            onChange={(e) => {
              setSaved(false);
              setQuiet((q) => ({ ...q, enabled: e.target.checked }));
            }}
            className="mt-0.5 size-5 shrink-0 accent-forest"
          />
          <span className="font-semibold text-ink">{t("quietToggle")}</span>
        </label>
        {quiet.enabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={ids.quietStart} label={t("quietStart")} required error={fieldError("quietStart")}>
              {(control) => (
                <Input {...control} type="time" name="quiet-start" value={quiet.start} onChange={(e) => { setSaved(false); setQuiet((q) => ({ ...q, start: e.target.value })); }} className="max-w-40 tabular" />
              )}
            </Field>
            <Field id={ids.quietEnd} label={t("quietEnd")} required error={fieldError("quietEnd")}>
              {(control) => (
                <Input {...control} type="time" name="quiet-end" value={quiet.end} onChange={(e) => { setSaved(false); setQuiet((q) => ({ ...q, end: e.target.value })); }} className="max-w-40 tabular" />
              )}
            </Field>
            {errors.length === 0 && /^\d{2}:\d{2}$/.test(quiet.start) && /^\d{2}:\d{2}$/.test(quiet.end) && quiet.start !== quiet.end ? (
              <p className={cn("text-sm text-ink sm:col-span-2")}>
                {t("quietSummary", { start: quiet.start, end: quiet.end })} {spansMidnight(quiet) ? t("quietOvernight") : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {apiError === "conflict" ? (
        <Notice
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={() => router.refresh()}>
              {t("reload")}
            </Button>
          }
        >
          {t("conflict")}
        </Notice>
      ) : apiError ? (
        <InlineError code={apiError} />
      ) : null}
      <div role="status" className="empty:hidden">
        {saved ? <Notice tone="info">{t("saved")}</Notice> : null}
      </div>
      <div>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
