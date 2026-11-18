"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { amendWithRecovery, newIntentKey } from "@/modules/clinical/finalize-flow";
import { pdfLinkState } from "@/modules/clinical/pdf";
import { AMENDMENT_REASONS, amendmentRequestSchema, type AmendmentReason, type AmendmentRequest, type ClinicalDraftContent } from "@/modules/clinical/schemas";
import { describeConsultationStatus } from "@/modules/clinical/status";
import { latestSigned, type Consultation, type PdfLink, type SignedConsultation } from "@/modules/clinical/types";
import { describePdfLinkState } from "@/modules/records/status";
import { CheckField, LongTextField, SelectField } from "./editor/fields";
import { ClinicalSummary } from "./editor/review-step";
import { AssessmentForm, CareForm, PrescriptionForm, VitalsForm } from "./editor/step-forms";
import { badgeFor } from "./kit";
import { useClinicalFormat } from "./use-format";

/** Read-only signed record: latest version, signer attribution, earlier versions and amendments. */
export function SignedRecordView({ record }: { record: SignedConsultation }) {
  const t = useTranslations("clinical.record");
  const { tk, dateTime } = useClinicalFormat();
  const latest = latestSigned(record);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge {...badgeFor(describeConsultationStatus(record.status), tk)} />
        <span className="text-sm text-muted tabular">{t("version", { version: latest.version })}</span>
        <span className="text-sm text-muted tabular">{t("signedBy", { name: latest.signedBy.displayName, time: dateTime(latest.signedAt) })}</span>
        {latest.signedBy.registrationLabel ? <span className="text-sm text-muted tabular">{t("registration", { label: latest.signedBy.registrationLabel })}</span> : null}
      </div>
      <ClinicalSummary content={latest.content} warnings={[]} tk={tk} headingLevel="h2" />
      <section aria-labelledby="amendments-title" className="grid gap-3 border-t border-border pt-5">
        <h2 id="amendments-title" className="font-semibold text-ink">
          {t("amendments")}
        </h2>
        {record.amendments.length === 0 ? (
          <p className="text-muted">{t("noAmendments")}</p>
        ) : (
          <ol className="grid gap-2">
            {record.amendments.map((a) => (
              <li key={a.version} className="grid gap-1">
                <span className="text-sm text-ink tabular">{t("amendedBy", { version: a.version, reason: tk(`clinical.amend.reasons.${a.reason}`), name: a.amendedBy.displayName, time: dateTime(a.amendedAt) })}</span>
                <span className="text-sm whitespace-pre-wrap text-muted">{a.reasonText}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {record.versions.length > 1 ? (
        <section aria-labelledby="versions-title" className="grid gap-3">
          <h2 id="versions-title" className="font-semibold text-ink">
            {t("versions")}
          </h2>
          {record.versions.slice(0, -1).reverse().map((v) => (
            <details key={v.version} className="rounded-md border border-border bg-surface p-4">
              <summary className="inline-flex min-h-target cursor-pointer items-center font-medium text-forest tabular">{t("showVersion", { version: v.version, time: dateTime(v.signedAt) })}</summary>
              <div className="pt-4">
                <ClinicalSummary content={v.content} warnings={[]} tk={tk} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** DC14: short-lived private link for the signed version only; expiry recovers by asking again. */
export function PdfPanel({ consultationId, version, request }: { consultationId: string; version: number; request: (consultationId: string) => Promise<ApiResult<PdfLink>> }) {
  const t = useTranslations("clinical.pdf");
  const tc = useTranslations("common.actions");
  const { tk, time } = useClinicalFormat();
  const titleId = useId();
  const now = useNow(5000);
  const [link, setLink] = useState<PdfLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = link ? pdfLinkState(link, now, version) : null;

  async function get() {
    setBusy(true);
    setError(null);
    try {
      const r = await request(consultationId);
      if (!r.ok) return setError(r.error.code);
      setLink(r.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        {state ? <StatusBadge {...badgeFor(describePdfLinkState(state.kind), tk)} /> : null}
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {error ? <InlineError code={error} /> : null}
      <div aria-live="polite" className="grid gap-2">
        {state?.kind === "ready" ? (
          <>
            {/* Signed URL: rel=noreferrer so it is never sent as a Referer; never logged or cached here. */}
            <a href={state.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-target w-fit items-center font-semibold text-forest underline underline-offset-4">
              {t("download", { version: state.version })}
            </a>
            <span className="text-sm text-muted tabular">{t("expiresIn", { time: time(link!.expiresAt) })}</span>
          </>
        ) : null}
        {state?.kind === "expired" ? <p className="text-ink">{t("expired")}</p> : null}
        {state?.kind === "version_mismatch" ? <p className="text-ink">{t("mismatch")}</p> : null}
      </div>
      {state?.kind !== "ready" ? (
        <div>
          <Button variant="secondary" onClick={get} disabled={busy} aria-busy={busy}>
            {busy ? tc("working") : t("request")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * DC07 amendment: a new signed version with a mandatory reason; the earlier version is kept.
 * Edits start from the latest signed content. No autosave: nothing is sent until submit.
 */
export function AmendmentForm({
  record,
  amend,
  getConsultation,
}: {
  record: SignedConsultation;
  amend: (consultationId: string, input: AmendmentRequest, key: string) => Promise<ApiResult<SignedConsultation>>;
  getConsultation: (consultationId: string) => Promise<ApiResult<Consultation>>;
}) {
  const t = useTranslations("clinical.amend");
  const tc = useTranslations("common.actions");
  const { tk } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const base = useId();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ClinicalDraftContent>(() => structuredClone(latestSigned(record).content));
  const [reason, setReason] = useState<AmendmentReason | "">("");
  const [reasonText, setReasonText] = useState("");
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "warning" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("action")}
        </Button>
      </div>
    );
  }

  async function submit() {
    const input = { baseVersion: record.currentVersion, reason, reasonText: reasonText.trim(), content, acknowledged: ack };
    const parsed = amendmentRequestSchema.safeParse(input);
    if (!parsed.success) return setMessage({ tone: "danger", text: tk("errors.api.validation") });
    setBusy(true);
    setMessage(null);
    key.current ??= newIntentKey();
    try {
      const out = await amendWithRecovery({ amend, getConsultation }, record.consultationId, parsed.data, key.current);
      if (out.kind === "signed") {
        key.current = null;
        setMessage({ tone: "info", text: t("done") });
        setOpen(false);
        startTransition(() => router.refresh());
      } else if (out.kind === "uncertain") setMessage({ tone: "warning", text: tk("clinical.review.uncertain") });
      else if (out.kind === "conflict") {
        setMessage({ tone: "warning", text: tk("clinical.review.conflict") });
        startTransition(() => router.refresh());
      } else setMessage({ tone: "danger", text: tk(`errors.api.${out.kind === "invalid" ? "validation" : out.kind === "denied" ? "forbidden" : out.kind === "signin" ? "unauthenticated" : "gated"}`) });
    } finally {
      setBusy(false);
    }
  }

  const p = `${base}-am`;
  return (
    <section aria-labelledby={`${p}-title`} className="grid gap-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <h2 id={`${p}-title`} className="font-display text-xl font-medium text-ink">
        {t("title")}
      </h2>
      <p className="text-muted">{t("intro")}</p>
      <SelectField
        id={`${p}-reason`}
        label={t("reason")}
        required
        value={reason}
        placeholder="—"
        options={AMENDMENT_REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
        onValue={setReason}
      />
      <LongTextField id={`${p}-reasonText`} label={t("reasonText")} hint={t("reasonTextHint")} required rows={3} maxLength={2000} value={reasonText} onValue={setReasonText} />
      <VitalsForm idPrefix={`${p}-v`} value={content.vitals} warnings={[]} tk={tk} onChange={(v) => setContent({ ...content, vitals: v })} />
      <AssessmentForm idPrefix={`${p}-a`} value={content.assessment} errors={{}} onChange={(v) => setContent({ ...content, assessment: v })} />
      <PrescriptionForm idPrefix={`${p}-p`} value={content.prescription} errors={{}} allergyFactVersions={[]} onChange={(v) => setContent({ ...content, prescription: v })} />
      <CareForm idPrefix={`${p}-c`} value={content.care} errors={{}} onChange={(v) => setContent({ ...content, care: v })} />
      <CheckField id={`${p}-ack`} label={t("ack")} checked={ack} onChecked={setAck} />
      <div aria-live="polite">{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}</div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={submit} disabled={busy} aria-busy={busy}>
          {busy ? tc("working") : t("submit")}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
