"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import {
  buildStepRail,
  missingMeta,
  nextStep,
  prevStep,
  STEP_LABEL_KEYS,
  updateStep,
  vitalWarnings,
  type AllergyBanner,
  type ClinicalStepId,
  type MissingFieldMeta,
} from "@/modules/clinical/editor";
import { canFinalize, isDirty } from "@/modules/clinical/draft-machine";
import { finalizeWithRecovery, newIntentKey } from "@/modules/clinical/finalize-flow";
import { editorLocked } from "./editor-lock";
import { missingForFinalize, type SaveDraftRequest, type SignRequest, type VitalWarningRule } from "@/modules/clinical/schemas";
import { describeDraftStatus } from "@/modules/clinical/status";
import type { Consultation, DraftSnapshot, SaveDraftResponse, SignedConsultation } from "@/modules/clinical/types";
import { useDraftAutosave } from "@/modules/clinical/use-draft-autosave";
import { describeBookingState } from "@/modules/doctor/status";
import type { AssignedVisitView } from "@/modules/doctor/types";
import { badgeFor } from "../kit";
import { useClinicalFormat } from "../use-format";
import { CheckField } from "./fields";
import { ClinicalSummary, MissingList } from "./review-step";
import { AssessmentForm, CareForm, PrescriptionForm, VitalsForm, type IncompleteReading } from "./step-forms";

export type EditorActions = {
  save: (consultationId: string, input: SaveDraftRequest) => Promise<ApiResult<SaveDraftResponse>>;
  fetchLatest: (consultationId: string) => Promise<ApiResult<DraftSnapshot>>;
  finalize: (consultationId: string, input: SignRequest, key: string) => Promise<ApiResult<SignedConsultation>>;
  getConsultation: (consultationId: string) => Promise<ApiResult<Consultation>>;
};

type VisitContext = Pick<AssignedVisitView, "bookingId" | "publicReference" | "scheduledStartAt" | "state" | "patient">;

/**
 * DC04-DC08 five-step consultation editor. Content lives only in memory (useDraftAutosave);
 * the server draft and version are authoritative. No clinical text is put in the URL, title,
 * storage, toasts or logs.
 */
export function ConsultationEditor({
  draft,
  visit,
  allergies,
  writable,
  vitalRules,
  allergyFactVersions,
  actions,
}: {
  draft: DraftSnapshot;
  visit: VisitContext;
  allergies: AllergyBanner;
  writable: boolean;
  vitalRules: VitalWarningRule[];
  allergyFactVersions: string[];
  actions: EditorActions;
}) {
  const t = useTranslations("clinical");
  const { tk, dateTime, time } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const auto = useDraftAutosave({
    initial: { consultationId: draft.consultationId, content: draft.content, version: draft.version, savedAt: draft.savedAt },
    save: actions.save,
    fetchLatest: actions.fetchLatest,
  });
  const content = auto.draft.content;
  const [step, setStep] = useState<ClinicalStepId>("vitals");
  const [showErrors, setShowErrors] = useState(false);
  const [ack, setAck] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signMessage, setSignMessage] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const signKey = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const warnings = useMemo(() => vitalWarnings(content, vitalRules), [content, vitalRules]);
  const missing = useMemo(() => missingMeta(missingForFinalize(content, warnings)), [content, warnings]);
  const rail = buildStepRail(content, warnings, step);
  const errorMap: Record<string, string> = showErrors ? Object.fromEntries(missing.map((m) => [m.field, tk(m.labelKey)])) : {};
  // Locked while signing is pending, so neither edits nor saves can race the finalize request.
  const disabled = editorLocked({ writable, finalized: auto.draft.finalized, signing });
  const edit = (next: typeof content) => {
    if (!disabled) auto.edit(next);
  };
  const idPrefix = "cx";

  // Focus the step heading on step change (or a requested field after "go to missing").
  useEffect(() => {
    const target = pendingFocus.current ? document.getElementById(pendingFocus.current) : headingRef.current;
    pendingFocus.current = null;
    target?.focus();
    target?.scrollIntoView({ block: "start" });
  }, [step]);

  // DC04: a half-entered reading (temperature without unit, one BP side) lives only in the vitals
  // form; leaving the step would drop it silently, so the doctor must finish or clear it first.
  const vitalsPending = useRef<IncompleteReading[]>([]);
  const [leaveBlocked, setLeaveBlocked] = useState<IncompleteReading[] | null>(null);
  const onVitalsIncomplete = useCallback((pending: IncompleteReading[]) => {
    vitalsPending.current = pending;
    if (pending.length === 0) setLeaveBlocked(null);
  }, []);
  const goTo = (s: ClinicalStepId) => {
    if (step === "vitals" && s !== "vitals" && vitalsPending.current.length > 0) {
      setLeaveBlocked(vitalsPending.current);
      document.getElementById(vitalsPending.current[0].fieldId)?.focus();
      return;
    }
    setLeaveBlocked(null);
    setStep(s);
  };
  const goToMissing = (m: MissingFieldMeta) => {
    setShowErrors(true);
    pendingFocus.current = `${idPrefix}-${m.focusId.replace(/^[a-z]+-/, "")}`;
    if (m.step === step) {
      document.getElementById(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    } else setStep(m.step);
  };

  async function sign() {
    setShowErrors(true);
    setSignMessage(null);
    if (missing.length > 0) return setSignMessage({ tone: "danger", text: t("review.fieldsMissing") });
    if (!ack) return setSignMessage({ tone: "danger", text: t("review.ackRequired") });
    if (!canFinalize(auto.draft)) return setSignMessage({ tone: "warning", text: t("review.saveFirst") });
    setSigning(true);
    signKey.current ??= newIntentKey();
    try {
      const out = await finalizeWithRecovery(
        { finalize: actions.finalize, getConsultation: actions.getConsultation },
        draft.consultationId,
        { expectedVersion: auto.draft.serverVersion, acknowledged: true },
        signKey.current,
      );
      if (out.kind === "signed") {
        auto.markFinalized();
        signKey.current = null;
        startTransition(() => router.push(`/doctor/records/${draft.consultationId}`));
      } else if (out.kind === "uncertain") setSignMessage({ tone: "warning", text: t("review.uncertain") });
      else if (out.kind === "conflict") {
        setSignMessage({ tone: "warning", text: t("review.conflict") });
        startTransition(() => router.refresh());
      } else if (out.kind === "invalid") setSignMessage({ tone: "danger", text: t("review.fieldsMissing") });
      else setSignMessage({ tone: "danger", text: tk(`errors.api.${out.kind === "denied" ? "forbidden" : out.kind === "signin" ? "unauthenticated" : "gated"}`) });
    } finally {
      setSigning(false);
    }
  }

  const status = describeDraftStatus(auto.draft.status);
  const conflict = auto.conflict;

  return (
    <div className="grid gap-6">
      {/* Persistent compact context header */}
      <section aria-label={t("context.label")} className="sticky top-16 z-20 -mx-4 grid gap-3 border-b border-border bg-paper/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-lg font-semibold text-ink">
              {visit.patient.displayName}
              {visit.patient.ageYears !== null ? <span className="font-normal text-muted"> · {tk("doctor.common.age", { age: visit.patient.ageYears })}</span> : null}
            </p>
            <p className="text-sm text-muted tabular">
              {t("context.reference", { reference: visit.publicReference })} · {t("context.appointment", { time: dateTime(visit.scheduledStartAt) })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge {...badgeFor(describeBookingState(visit.state), tk)} />
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted tabular">
              <StatusBadge {...badgeFor(status, tk)} />
              <span>{auto.draft.lastSavedAt ? t("draft.savedAt", { time: time(auto.draft.lastSavedAt) }) : t("draft.neverSaved")}</span>
            </p>
          </div>
        </div>
        <AllergyLine allergies={allergies} />
      </section>

      {!writable ? <Notice tone="neutral">{t("workspace.readOnly")}</Notice> : null}

      {conflict ? (
        <Notice
          tone="danger"
          title={t("conflict.title")}
          role="alert"
          action={
            conflict.phase === "review" ? (
              <>
                <Button onClick={() => auto.resolveConflict("keep_local", conflict.editSeq)}>{t("conflict.keepMine")}</Button>
                <Button variant="secondary" onClick={() => auto.resolveConflict("take_server", conflict.editSeq)}>
                  {t("conflict.useServer")}
                </Button>
              </>
            ) : conflict.phase === "error" ? (
              <Button variant="secondary" onClick={() => auto.reloadConflict()}>
                {t("draft.retry")}
              </Button>
            ) : null
          }
        >
          <p>{t("conflict.body")}</p>
          {conflict.phase === "loading" ? <p className="mt-1 text-sm">{t("conflict.loading")}</p> : null}
          {conflict.phase === "error" ? <p className="mt-1 text-sm">{t("conflict.loadError")}</p> : null}
          {conflict.phase === "review" ? (
            <ul className="mt-2 grid gap-1 text-sm">
              <li>{t("conflict.changedSteps", { steps: conflict.changedSteps.map((s) => tk(STEP_LABEL_KEYS[s])).join(", ") || "—" })}</li>
              <li>{t("conflict.keepMineHint")}</li>
              <li>{t("conflict.useServerHint")}</li>
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {auto.draft.status === "failed" ? (
        <InlineError code={auto.draft.lastErrorCode ?? undefined} action={<Button variant="secondary" onClick={() => auto.saveNow()}>{t("draft.retry")}</Button>} />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Step rail (desktop) / compact stepper (mobile) */}
        <nav aria-label={t("editor.steps")} className="lg:sticky lg:top-44 lg:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible">
            {rail.map((r, i) => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={r.current ? "step" : undefined}
                  onClick={() => goTo(r.id)}
                  className={cn(
                    "flex min-h-target w-full items-center gap-3 rounded-md px-3 text-left text-sm",
                    "focus-visible:outline-3 focus-visible:outline-focus",
                    r.current ? "bg-mist font-semibold text-forest" : "text-ink hover:bg-mist/60",
                  )}
                >
                  <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular", r.status === "complete" || r.status === "ready" ? "border-forest bg-forest text-on-forest" : r.status === "needs_attention" || (showErrors && (r.status === "in_progress" || r.status === "blocked")) ? "border-warning bg-warning-surface text-warning-text" : "border-border-strong text-muted")}>
                    {r.status === "needs_attention" ? <AlertTriangle aria-hidden className="size-3.5" /> : i + 1}
                  </span>
                  <span className="grid">
                    <span className="whitespace-nowrap">{tk(r.labelKey)}</span>
                    <span className="hidden text-xs font-normal text-muted lg:block">{t(`editor.stepStatus.${r.status}`)}</span>
                    <span className="sr-only lg:hidden"> ({t(`editor.stepStatus.${r.status}`)})</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid min-w-0 content-start gap-6">
          <h2 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-medium text-ink outline-none">
            {tk(STEP_LABEL_KEYS[step])}
          </h2>

          {step === "vitals" && leaveBlocked && leaveBlocked.length > 0 ? (
            <Notice tone="danger" role="alert" title={t("vitals.incompleteTitle")}>
              <ul className="grid gap-1">
                {leaveBlocked.map((p) => (
                  <li key={p.fieldId}>
                    <a href={`#${p.fieldId}`} className="underline underline-offset-4">
                      {p.message}
                    </a>
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {step === "vitals" ? <VitalsForm idPrefix={idPrefix} value={content.vitals} disabled={disabled} warnings={warnings} tk={tk} onIncomplete={onVitalsIncomplete} onChange={(v) => edit(updateStep(content, "vitals", v))} /> : null}
          {step === "assessment" ? <AssessmentForm idPrefix={idPrefix} value={content.assessment} disabled={disabled} errors={errorMap} onChange={(v) => edit(updateStep(content, "assessment", v))} /> : null}
          {step === "prescription" ? (
            <>
              {allergies.kind !== "none_recorded" ? <AllergyLine allergies={allergies} prominent /> : null}
              <PrescriptionForm idPrefix={idPrefix} value={content.prescription} disabled={disabled} errors={errorMap} allergyFactVersions={allergyFactVersions} onChange={(v) => edit(updateStep(content, "prescription", v))} />
            </>
          ) : null}
          {step === "care" ? <CareForm idPrefix={idPrefix} value={content.care} disabled={disabled} errors={errorMap} onChange={(v) => edit(updateStep(content, "care", v))} /> : null}
          {step === "review" ? (
            <div className="grid gap-6">
              <p className="text-muted">{t("review.intro")}</p>
              <MissingList missing={missing} tk={tk} onGo={goToMissing} />
              <ClinicalSummary content={content} warnings={warnings} tk={tk} onEdit={goTo} />
              <div className="grid gap-4 border-t border-border pt-6">
                <CheckField id={`${idPrefix}-signAck`} label={t("review.ack")} checked={ack} disabled={disabled} onChecked={setAck} />
                {isDirty(auto.draft) || auto.draft.status !== "saved" ? <p className="text-sm text-muted">{t("review.saveFirst")}</p> : null}
                <div aria-live="assertive">{signMessage ? <Notice tone={signMessage.tone}>{signMessage.text}</Notice> : null}</div>
                <div>
                  <Button size="lg" onClick={sign} disabled={disabled || signing || !!conflict} aria-busy={signing}>
                    {signing ? t("review.signing") : t("review.sign")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sticky safe action area: above the mobile bottom nav, never over the content's end. */}
      <div role="toolbar" aria-label={t("editor.actions")} className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8">
        <Button variant="quiet" onClick={() => prevStep(step) && goTo(prevStep(step)!)} disabled={!prevStep(step)}>
          <ArrowLeft aria-hidden />
          <span className="max-sm:sr-only">{t("editor.back")}</span>
        </Button>
        <Button variant="secondary" onClick={() => auto.saveNow()} disabled={disabled || !isDirty(auto.draft) || !!auto.draft.inFlight || !!conflict}>
          <Save aria-hidden />
          {t("draft.save")}
        </Button>
        {nextStep(step) ? (
          <Button onClick={() => goTo(nextStep(step)!)}>
            <span className="max-sm:sr-only">{t("editor.next")}</span>
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <span className="min-w-target" aria-hidden />
        )}
      </div>
    </div>
  );
}

function AllergyLine({ allergies, prominent = false }: { allergies: AllergyBanner; prominent?: boolean }) {
  const t = useTranslations("clinical.context");
  if (allergies.kind === "known") {
    return (
      <p role="note" className={cn("flex flex-wrap items-center gap-2 text-sm text-ink", prominent && "rounded-md bg-warning-surface p-3 text-base")}>
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning-text" />
        <span className="font-semibold">{t("allergyKnown")}:</span>
        {allergies.items.map((a, i) => (
          <span key={i}>
            {a.value}
            {a.verified ? null : <span className="text-muted"> ({t("allergyUnverified")})</span>}
            {i < allergies.items.length - 1 ? "," : null}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p role="note" className={cn("flex items-center gap-2 text-sm text-muted", prominent && "rounded-md bg-paper-deep p-3 text-base text-ink")}>
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      {allergies.kind === "none_recorded" ? t("allergyNone") : t("allergyUnknown")}
    </p>
  );
}
