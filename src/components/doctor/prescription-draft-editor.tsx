"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldControlClass } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field, FormSection } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { useClinicalFormat } from "@/components/clinical/use-format";
import { useHydrated } from "@/components/clinical/use-hydrated";
import { HydrationStatus, hydrationBusy } from "@/components/clinical/hydration-status";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import {
  emptyRow,
  INSTRUCTION_TEMPLATES,
  MAX_DURATION_DAYS,
  MAX_ITEMS,
  MEDICINE_FORMS,
  parseRow,
  rowFromItem,
  SCHEDULE_TEMPLATES,
  type DiscardDraftInput,
  type DraftItem,
  type DraftRow,
  type PrescriptionDraft,
  type RowError,
  type SaveDraftInput,
} from "@/modules/prescription-drafts/types";

type Actions = {
  save: (bookingId: string, input: SaveDraftInput) => Promise<ApiResult<PrescriptionDraft>>;
  discard: (bookingId: string, input: DiscardDraftInput) => Promise<ApiResult<null>>;
};

const newKey = () => `row-${globalThis.crypto.randomUUID().slice(0, 8)}`;

/**
 * Template-only prescription draft. The medicine name is typed (no drug database or suggestions);
 * form, schedule and instruction are fixed templates. No autosave, no browser storage, and no
 * issue/send action: the draft never leaves the doctor workspace.
 */
export function PrescriptionDraftEditor({ bookingId, initial, actions }: { bookingId: string; initial: PrescriptionDraft | null; actions: Actions }) {
  const t = useTranslations("prescriptionDrafts");
  const tc = useTranslations("common.actions");
  const fmt = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const base = useId();
  const id = (key: string, f: RowError) => `${base}-${key}-${f}`;
  const initialRows = initial ? initial.items.map(rowFromItem) : [emptyRow("row-initial")];

  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialRows));
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [savedAt, setSavedAt] = useState(initial?.updatedAt ?? null);
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DraftItem[]>(initial?.items ?? []);
  const dirty = JSON.stringify(rows) !== savedSnapshot;
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (pendingFocus.current) document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [rows.length]);

  const fieldError = (fid: string) => errors.find((e) => e.fieldId === fid)?.message;
  const update = (key: string, patch: Partial<DraftRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    const key = newKey();
    pendingFocus.current = id(key, "medicineName");
    setRows((rs) => [...rs, emptyRow(key)]);
  }
  function removeRow(key: string, index: number) {
    const nextFocus = rows[index + 1]?.key ?? rows[index - 1]?.key;
    pendingFocus.current = nextFocus ? id(nextFocus, "medicineName") : `${base}-add`;
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  const ERROR_KEY: Record<RowError, string> = {
    medicineName: "errors.medicineName",
    form: "errors.form",
    strength: "errors.strength",
    schedule: "errors.schedule",
    durationDays: "errors.duration",
    instruction: "errors.instruction",
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    const next: SummaryError[] = [];
    const items: DraftItem[] = [];
    rows.forEach((r, i) => {
      const p = parseRow(r);
      if (p.ok) items.push(p.item);
      else for (const f of p.errors) next.push({ fieldId: id(r.key, f), message: t(ERROR_KEY[f] as "errors.form", { n: i + 1, max: MAX_DURATION_DAYS }) });
    });
    if (rows.length === 0) next.push({ fieldId: `${base}-add`, message: t("errors.noItems") });
    setErrors(next);
    setAttempt((a) => a + 1);
    if (next.length > 0) return;
    setBusy(true);
    try {
      const r = await actions.save(bookingId, { expectedVersion: version, items });
      if (!r.ok) {
        if (r.error.code === "conflict") setConflict(true);
        else setApiError(r.error.code);
        return;
      }
      const saved = r.data.items.map(rowFromItem);
      setSavedSnapshot(JSON.stringify(saved));
      setRows(saved);
      setVersion(r.data.version);
      setSavedAt(r.data.updatedAt);
      setPreview(r.data.items);
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    const r = await actions.discard(bookingId, { expectedVersion: version });
    if (!r.ok) {
      if (r.error.code === "conflict") setConflict(true);
      return { ok: false as const, code: r.error.code };
    }
    setSavedSnapshot(JSON.stringify(rows));
    startTransition(() => router.refresh());
    return { ok: true as const };
  }

  const hydrated = useHydrated();
  const disabled = busy || conflict || !hydrated;

  return (
    <div className="grid gap-8">
      <form onSubmit={onSave} noValidate className="grid max-w-form gap-6" aria-labelledby={`${base}-title`} {...hydrationBusy(hydrated)}>
      <HydrationStatus hydrated={hydrated} />
        <h2 id={`${base}-title`} className="text-lg font-semibold text-ink">
          {t("editor.title")}
        </h2>
        <p className="text-sm text-muted">{t("editor.intro")}</p>
        <ErrorSummary errors={errors} focusKey={attempt} />
        {conflict ? (
          <Notice
            tone="danger"
            role="alert"
            title={t("conflict.title")}
            action={
              <Button type="button" variant="secondary" onClick={() => startTransition(() => router.refresh())}>
                {t("conflict.reload")}
              </Button>
            }
          >
            {t("conflict.body")}
          </Notice>
        ) : null}

        <ol className="grid gap-6">
          {rows.map((r, i) => (
            <li key={r.key}>
              <FormSection legend={t("item.legend", { n: i + 1 })}>
                <div className="grid gap-5">
                  <Field id={id(r.key, "medicineName")} label={t("item.medicineName")} hint={t("item.medicineNameHint")} required error={fieldError(id(r.key, "medicineName"))}>
                    {(c) => <Input {...c} autoComplete="off" spellCheck={false} maxLength={120} disabled={disabled} value={r.medicineName} onChange={(e) => update(r.key, { medicineName: e.target.value })} />}
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id={id(r.key, "form")} label={t("item.form")} required error={fieldError(id(r.key, "form"))}>
                      {(c) => (
                        <select {...c} className={fieldControlClass} disabled={disabled} value={r.form} onChange={(e) => update(r.key, { form: e.target.value as DraftRow["form"] })}>
                          <option value="">{t("item.choose")}</option>
                          {MEDICINE_FORMS.map((f) => (
                            <option key={f} value={f}>
                              {t(`form.${f}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <Field id={id(r.key, "strength")} label={t("item.strength")} hint={t("item.strengthHint")} error={fieldError(id(r.key, "strength"))}>
                      {(c) => <Input {...c} autoComplete="off" maxLength={40} disabled={disabled} value={r.strength} onChange={(e) => update(r.key, { strength: e.target.value })} />}
                    </Field>
                    <Field id={id(r.key, "schedule")} label={t("item.schedule")} required error={fieldError(id(r.key, "schedule"))}>
                      {(c) => (
                        <select {...c} className={fieldControlClass} disabled={disabled} value={r.schedule} onChange={(e) => update(r.key, { schedule: e.target.value as DraftRow["schedule"] })}>
                          <option value="">{t("item.choose")}</option>
                          {SCHEDULE_TEMPLATES.map((s) => (
                            <option key={s} value={s}>
                              {t(`schedule.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <Field id={id(r.key, "durationDays")} label={t("item.duration")} hint={t("item.durationHint", { max: MAX_DURATION_DAYS })} required error={fieldError(id(r.key, "durationDays"))}>
                      {(c) => <Input {...c} inputMode="numeric" autoComplete="off" maxLength={3} className="max-w-32 tabular" disabled={disabled} value={r.durationText} onChange={(e) => update(r.key, { durationText: e.target.value })} />}
                    </Field>
                    <Field id={id(r.key, "instruction")} label={t("item.instruction")} required error={fieldError(id(r.key, "instruction"))} className="sm:col-span-2">
                      {(c) => (
                        <select {...c} className={fieldControlClass} disabled={disabled} value={r.instruction} onChange={(e) => update(r.key, { instruction: e.target.value as DraftRow["instruction"] })}>
                          <option value="">{t("item.choose")}</option>
                          {INSTRUCTION_TEMPLATES.map((s) => (
                            <option key={s} value={s}>
                              {t(`instruction.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  </div>
                  <div>
                    <Button type="button" variant="quiet" disabled={disabled} onClick={() => removeRow(r.key, i)}>
                      <Trash2 aria-hidden />
                      {t("item.remove", { n: i + 1 })}
                    </Button>
                  </div>
                </div>
              </FormSection>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3">
          <Button id={`${base}-add`} type="button" variant="secondary" disabled={disabled || rows.length >= MAX_ITEMS} onClick={addRow}>
            <Plus aria-hidden />
            {t("editor.add")}
          </Button>
        </div>
        {rows.length >= MAX_ITEMS ? <p className="text-sm text-muted">{t("editor.max", { max: MAX_ITEMS })}</p> : null}

        <p role="status" className="text-sm text-muted tabular">
          {dirty ? t("editor.unsaved") : savedAt ? t("editor.savedAt", { time: fmt.time(savedAt) }) : t("editor.notSaved")}
        </p>
        {apiError ? <InlineError code={apiError} /> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={disabled} aria-busy={busy}>
            {busy ? tc("working") : t("editor.save")}
          </Button>
          {version > 0 ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="quiet" disabled={disabled}>
                  {t("discard.action")}
                </Button>
              }
              title={t("discard.title")}
              description={t("discard.body")}
              confirmLabel={t("discard.confirm")}
              tone="danger"
              onConfirm={onDiscard}
            />
          ) : null}
        </div>
      </form>

      {preview.length > 0 ? (
        <section aria-labelledby={`${base}-preview`} className="grid max-w-form gap-3 rounded-lg border border-dashed border-border-strong bg-paper-deep p-5">
          <h2 id={`${base}-preview`} className="text-lg font-semibold text-ink">
            {t("preview.title")}
          </h2>
          <p className="text-sm font-semibold text-warning-text">{t("preview.notIssued")}</p>
          <ol className="grid list-decimal gap-2 pl-6">
            {preview.map((p) => (
              <li key={p.key} className="text-ink">
                {t("preview.line", {
                  form: t(`form.${p.form}`),
                  name: p.medicineName,
                  strength: p.strength ? ` ${p.strength}` : "",
                  schedule: t(`schedule.${p.schedule}`),
                  days: p.durationDays,
                  instruction: p.instruction === "none" ? "" : `, ${t(`instruction.${p.instruction}`)}`,
                })}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
