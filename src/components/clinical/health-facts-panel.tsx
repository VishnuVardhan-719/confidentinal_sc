"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { factBadge } from "@/modules/records/logic";
import { describeFactBadge } from "@/modules/records/status";
import type { ConfirmFactsInput, CorrectFactInput, HealthFactView } from "@/modules/records/types";
import { CheckField, LongTextField, TextField } from "./editor/fields";
import { badgeFor } from "./kit";
import { useClinicalFormat } from "./use-format";

/**
 * DC11 health fact review. Only facts the clinician selects are confirmed, with stated evidence;
 * every confirmation or correction appends an attributed version and keeps the history.
 */
export function HealthFactsPanel({
  bookingId,
  facts,
  disabled,
  confirm,
  correct,
}: {
  bookingId: string;
  facts: HealthFactView[];
  disabled: boolean;
  confirm: (bookingId: string, input: ConfirmFactsInput) => Promise<ApiResult<HealthFactView[]>>;
  correct: (bookingId: string, input: CorrectFactInput) => Promise<ApiResult<HealthFactView>>;
}) {
  const t = useTranslations("clinical.facts");
  const tc = useTranslations("common.actions");
  const { tk, dateTime } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const ids = { title: useId(), evidence: useId(), ack: useId(), list: useId() };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [evidence, setEvidence] = useState("");
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const kindLabel = (k: HealthFactView["kind"]) => t(`kind.${k}`);
  const sourceLabel = (s: "patient_entered" | "doctor_verified") => tk(`clinical.facts.badge.${s === "doctor_verified" ? "doctorVerified" : "patientEntered"}`);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: SummaryError[] = [];
    if (selected.size === 0) next.push({ fieldId: ids.list, message: t("selectOne") });
    if (evidence.trim().length < 3) next.push({ fieldId: ids.evidence, message: t("evidenceRequired") });
    if (!ack) next.push({ fieldId: ids.ack, message: t("ackRequired") });
    setErrors(next);
    setAttempt((a) => a + 1);
    if (next.length) return;
    setBusy(true);
    setApiError(null);
    setDone(null);
    try {
      const chosen = facts.filter((f) => selected.has(f.factId)).map((f) => ({ factId: f.factId, expectedVersion: f.current.version }));
      const r = await confirm(bookingId, { facts: chosen, evidenceNote: evidence.trim(), reviewAcknowledged: true });
      if (!r.ok) return setApiError(r.error.code);
      setSelected(new Set());
      setEvidence("");
      setAck(false);
      setDone(t("confirmed"));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={ids.title} className="grid gap-4">
      <h2 id={ids.title} className="text-lg font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="text-sm text-muted">{t("intro")}</p>
      {facts.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-5">
          <ErrorSummary errors={errors} focusKey={attempt} />
          <ul id={ids.list} tabIndex={-1} className="divide-y divide-border rounded-lg border border-border bg-surface outline-none">
            {facts.map((f) => {
              const badge = factBadge(f);
              const checkboxId = `${ids.list}-${f.factId}`;
              return (
                <li key={f.factId} className="grid gap-2 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <label htmlFor={checkboxId} className="flex min-h-target flex-1 cursor-pointer items-start gap-3">
                      <Checkbox
                        id={checkboxId}
                        className="mt-0.5"
                        disabled={disabled}
                        aria-label={t("select", { kind: kindLabel(f.kind) })}
                        checked={selected.has(f.factId)}
                        onCheckedChange={(c) => setSelected((s) => {
                          const n = new Set(s);
                          if (c === true) n.add(f.factId);
                          else n.delete(f.factId);
                          return n;
                        })}
                      />
                      <span className="grid gap-0.5">
                        <span className="text-sm text-muted">{kindLabel(f.kind)}</span>
                        <span className="font-semibold text-ink">{f.current.value}</span>
                      </span>
                    </label>
                    <StatusBadge {...badgeFor(describeFactBadge(badge), tk)} />
                  </div>
                  {f.current.verifier && f.current.evidenceNote ? <p className="text-sm text-muted">{t("verifiedBy", { name: f.current.verifier.displayName, evidence: f.current.evidenceNote })}</p> : null}
                  {f.current.correctionReason ? <p className="text-sm text-muted">{t("correction", { reason: f.current.correctionReason })}</p> : null}
                  {f.history.length ? (
                    <details className="text-sm">
                      <summary className="inline-flex min-h-target cursor-pointer items-center text-forest">{t("history")}</summary>
                      <ul className="grid gap-1 pl-4 text-muted tabular">
                        {f.history.map((h) => (
                          <li key={h.version}>{t("historyItem", { version: h.version, value: h.value, source: sourceLabel(h.source), time: dateTime(h.recordedAt) })}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {disabled ? null : correcting === f.factId ? (
                    <CorrectFactForm
                      fact={f}
                      kindLabel={kindLabel(f.kind)}
                      onCancel={() => setCorrecting(null)}
                      onSubmit={async (input) => {
                        const r = await correct(bookingId, input);
                        if (r.ok) {
                          setCorrecting(null);
                          setDone(t("corrected"));
                          startTransition(() => router.refresh());
                        }
                        return r.ok ? null : r.error.code;
                      }}
                    />
                  ) : (
                    <div>
                      <Button type="button" variant="quiet" onClick={() => setCorrecting(f.factId)}>
                        {t("correct")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {disabled ? null : (
            <>
              <LongTextField id={ids.evidence} label={t("evidence")} hint={t("evidenceHint")} required rows={2} maxLength={1000} value={evidence} onValue={setEvidence} error={errors.find((e) => e.fieldId === ids.evidence)?.message} />
              <CheckField id={ids.ack} label={t("ack")} checked={ack} onChecked={setAck} error={errors.find((e) => e.fieldId === ids.ack)?.message} />
              {apiError ? <InlineError code={apiError} /> : null}
              <div aria-live="polite">{done ? <Notice tone="info">{done}</Notice> : null}</div>
              <div>
                <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
                  {busy ? tc("working") : t("confirm")}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}

function CorrectFactForm({ fact, kindLabel, onCancel, onSubmit }: { fact: HealthFactView; kindLabel: string; onCancel: () => void; onSubmit: (input: CorrectFactInput) => Promise<string | null> }) {
  const t = useTranslations("clinical.facts");
  const tc = useTranslations("common.actions");
  const base = useId();
  const [value, setValue] = useState(fact.current.value);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = value.trim().length > 0 && reason.trim().length >= 10 && evidence.trim().length >= 3 && ack;
  return (
    <div role="group" aria-label={t("correctTitle", { kind: kindLabel })} className="grid gap-4 rounded-md bg-paper p-4">
      <TextField id={`${base}-value`} label={t("newValue")} required maxLength={500} value={value} onValue={setValue} />
      <LongTextField id={`${base}-reason`} label={t("correctReason")} required rows={2} maxLength={1000} value={reason} onValue={setReason} />
      <TextField id={`${base}-evidence`} label={t("evidence")} required maxLength={1000} value={evidence} onValue={setEvidence} />
      <CheckField id={`${base}-ack`} label={t("ack")} checked={ack} onChecked={setAck} />
      {error ? <InlineError code={error} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!valid || busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setError(await onSubmit({ factId: fact.factId, expectedVersion: fact.current.version, newValue: value.trim(), reason: reason.trim(), evidenceNote: evidence.trim(), reviewAcknowledged: true }));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? tc("working") : t("correctSubmit")}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
