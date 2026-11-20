"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { useClinicalFormat } from "@/components/clinical/use-format";
import { useHydrated } from "@/components/clinical/use-hydrated";
import { useUnsavedChangesGuard } from "@/components/clinical/use-unsaved-guard";
import { HydrationStatus, hydrationBusy } from "@/components/clinical/hydration-status";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import {
  EMPTY_SECTIONS,
  missingForSignOff,
  NOTE_SECTION_MAX,
  NOTE_SECTIONS,
  REQUIRED_FOR_SIGN_OFF,
  type ConsultationNote,
  type NoteSection,
  type NoteSections,
  type SaveNoteInput,
  type SignOffInput,
} from "@/modules/consultation-notes/types";

type Actions = {
  save: (bookingId: string, input: SaveNoteInput) => Promise<ApiResult<ConsultationNote>>;
  signOff: (bookingId: string, input: SignOffInput) => Promise<ApiResult<ConsultationNote>>;
};

/**
 * Draft -> sign-off editor. No autosave and no browser storage: text lives in component state
 * until the doctor presses Save draft or Sign off; leaving with unsaved text asks first.
 */
export function NoteEditor({ bookingId, initial, actions }: { bookingId: string; initial: ConsultationNote | null; actions: Actions }) {
  const t = useTranslations("consultationNotes");
  const tc = useTranslations("common.actions");
  const fmt = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const base = useId();
  const fieldId = (s: NoteSection) => `${base}-${s}`;
  const attestId = `${base}-attest`;

  const [saved, setSaved] = useState<NoteSections>(initial?.sections ?? EMPTY_SECTIONS);
  const [sections, setSections] = useState<NoteSections>(initial?.sections ?? EMPTY_SECTIONS);
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<"save" | "sign" | null>(null);
  const hydrated = useHydrated();
  const locked = busy !== null || conflict || !hydrated;
  const dirty = NOTE_SECTIONS.some((s) => sections[s] !== saved[s]);

  useUnsavedChangesGuard(dirty);

  const err = (s: NoteSection) => errors.find((e) => e.fieldId === fieldId(s))?.message;
  const attestError = errors.find((e) => e.fieldId === attestId)?.message;

  function tooLong(): SummaryError[] {
    return NOTE_SECTIONS.filter((s) => sections[s].length > NOTE_SECTION_MAX).map((s) => ({ fieldId: fieldId(s), message: t("errors.tooLong", { section: t(`sections.${s}.label`), max: NOTE_SECTION_MAX }) }));
  }

  /** Saves when there are unsaved changes; returns the version to sign off, or null on failure. */
  async function persist(): Promise<number | null> {
    if (!dirty && version > 0) return version;
    const r = await actions.save(bookingId, { expectedVersion: version, sections });
    if (!r.ok) {
      if (r.error.code === "conflict") setConflict(true);
      else setApiError(r.error.code);
      return null;
    }
    setSaved(r.data.sections);
    setVersion(r.data.version);
    setSavedAt(r.data.updatedAt);
    return r.data.version;
  }

  async function onSave() {
    setApiError(null);
    const next = tooLong();
    setErrors(next);
    setAttempt((a) => a + 1);
    if (next.length > 0) return;
    setBusy("save");
    try {
      await persist();
    } finally {
      setBusy(null);
    }
  }

  async function onSignOff(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    const next = [
      ...missingForSignOff(sections).map((s) => ({ fieldId: fieldId(s), message: t("errors.required", { section: t(`sections.${s}.label`) }) })),
      ...tooLong(),
      ...(attest ? [] : [{ fieldId: attestId, message: t("errors.attest") }]),
    ];
    setErrors(next);
    setAttempt((a) => a + 1);
    if (next.length > 0) return;
    setBusy("sign");
    try {
      const v = await persist();
      if (v === null) return;
      const r = await actions.signOff(bookingId, { expectedVersion: v, attest: true });
      if (!r.ok) {
        if (r.error.code === "conflict") setConflict(true);
        else setApiError(r.error.code);
        return;
      }
      setSaved(r.data.sections);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  const savedTime = savedAt ? fmt.time(savedAt) : null;

  return (
    <form onSubmit={onSignOff} noValidate className="grid max-w-form gap-6" aria-labelledby={`${base}-title`} {...hydrationBusy(hydrated)}>
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
      {NOTE_SECTIONS.map((s) => (
        <Field key={s} id={fieldId(s)} label={t(`sections.${s}.label`)} hint={t(`sections.${s}.hint`)} required={REQUIRED_FOR_SIGN_OFF.includes(s)} error={err(s)}>
          {(control) => (
            <Textarea
              {...control}
              rows={s === "summary" || s === "findings" ? 5 : 3}
              maxLength={NOTE_SECTION_MAX}
              autoComplete="off"
              disabled={locked}
              value={sections[s]}
              onChange={(e) => setSections((prev) => ({ ...prev, [s]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <p role="status" className="text-sm text-muted tabular">
        {dirty ? t("editor.unsaved") : savedTime ? t("editor.savedAt", { time: savedTime }) : t("editor.notSaved")}
      </p>
      {apiError ? <InlineError code={apiError} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={onSave} disabled={locked || (!dirty && version > 0)} aria-busy={busy === "save"}>
          {busy === "save" ? tc("working") : t("editor.save")}
        </Button>
      </div>

      <fieldset className="grid gap-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold text-ink">{t("signOff.title")}</legend>
        <p className="text-sm text-muted">{t("signOff.intro")}</p>
        <div className="grid gap-1">
          {attestError ? (
            <p id={`${attestId}-error`} className="text-sm font-medium text-danger">
              {attestError}
            </p>
          ) : null}
          <label className="flex min-h-target cursor-pointer items-start gap-3 text-ink">
            <input
              id={attestId}
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-forest"
              checked={attest}
              disabled={locked}
              aria-invalid={attestError ? true : undefined}
              aria-describedby={attestError ? `${attestId}-error` : undefined}
              onChange={(e) => setAttest(e.target.checked)}
            />
            <span>{t("signOff.attest")}</span>
          </label>
        </div>
        <div>
          <Button type="submit" disabled={locked} aria-busy={busy === "sign"}>
            {busy === "sign" ? tc("working") : t("signOff.action")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
