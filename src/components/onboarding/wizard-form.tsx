"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/shared/error-summary";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { ProviderCategory } from "@/modules/auth/roles";
import { savePatientSectionAction, saveProviderSectionAction } from "@/modules/onboarding/actions";
import type { PatientStepId } from "@/modules/onboarding/patient";
import { SAVE_IDLE, type SaveState } from "@/modules/onboarding/wizard";
import type { EvidenceOption } from "./field-renderer";
import { sectionFromForm, sectionToForm, type SectionFormState } from "./form-spec";
import { PATIENT_SPECS, providerSpec } from "./section-specs";
import { ensureRow, SectionBlock } from "./section-block";
import { useSpecFormContext } from "./use-spec-form";

export type WizardMode = { kind: "patient" } | { kind: "provider"; category: ProviderCategory; providerId: string };

/** Section saves report paths relative to the section; the form addresses fields as "<section>.<path>". */
function prefixErrors(state: SaveState, sectionId: string): SaveState {
  if (state.status !== "invalid") return state;
  const fieldErrors = Object.fromEntries(
    Object.entries(state.fieldErrors).map(([path, key]) => [path === sectionId || path.startsWith(`${sectionId}.`) ? path : `${sectionId}.${path}`, key]),
  );
  return { ...state, fieldErrors };
}

/**
 * One wizard step. Values stay in memory until "Save and continue"; the server action re-validates
 * the section, saves it against the draft version and redirects to the next step. The last step
 * saves in place and refreshes the page so the server can recompute what is still needed.
 */
export function WizardForm({
  mode,
  sectionId,
  initial,
  version,
  locale,
  backHref,
  last = false,
  evidence = [],
}: {
  mode: WizardMode;
  sectionId: string;
  initial: unknown;
  version: number;
  locale: string;
  /** Locale-free href of the previous step, if any. */
  backHref: string | null;
  last?: boolean;
  evidence?: readonly EvidenceOption[];
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const spec = mode.kind === "patient" ? PATIENT_SPECS[sectionId as PatientStepId] : providerSpec(mode.category, sectionId);
  const [raw, dispatch, pending] = useActionState<SaveState, unknown>(
    mode.kind === "patient" ? savePatientSectionAction : saveProviderSectionAction,
    SAVE_IDLE,
  );
  const state = useMemo(() => prefixErrors(raw, sectionId), [raw, sectionId]);
  const [form, setForm] = useState<SectionFormState | null>(() => (spec ? ensureRow(spec, sectionToForm(spec, initial)) : null));
  const [attempt, setAttempt] = useState(0);
  const { ctx, summary, statusText } = useSpecFormContext(state, pending, evidence);

  useEffect(() => {
    if (raw.status === "saved") router.refresh();
  }, [raw, router]);

  if (!spec || !form) return null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spec || !form) return;
    setAttempt((n) => n + 1);
    const value = sectionFromForm(spec, form);
    const common = { value, expectedVersion: version, advance: !last, locale };
    const payload =
      mode.kind === "patient"
        ? { ...common, section: sectionId }
        : { ...common, category: mode.category, providerId: mode.providerId, sectionId };
    startTransition(() => dispatch(payload));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8" aria-busy={pending}>
      <ErrorSummary errors={summary} focusKey={`${attempt}:${state.status}`} />
      {statusText && summary.length === 0 ? (
        <Notice
          role="alert"
          tone={state.status === "gated" ? "neutral" : "danger"}
          title={t("form.saveProblem")}
          action={
            state.status === "conflict" ? (
              <Button variant="secondary" onClick={() => router.refresh()}>
                {t("form.reload")}
              </Button>
            ) : undefined
          }
        >
          {statusText}
        </Notice>
      ) : null}

      <SectionBlock sectionId={sectionId} spec={spec} state={form} onState={setForm} ctx={ctx} />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? t("form.saving") : last ? t("form.save") : t("form.saveContinue")}
        </Button>
        {backHref ? (
          <Button asChild variant="secondary" size="lg">
            <Link href={backHref}>{t("form.back")}</Link>
          </Button>
        ) : null}
        <p className="text-sm text-muted" aria-live="polite">
          {raw.status === "saved" ? t("form.saved") : null}
        </p>
      </div>
    </form>
  );
}
