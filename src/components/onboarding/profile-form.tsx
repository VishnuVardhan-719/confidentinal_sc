"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/shared/error-summary";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { saveProfileAction } from "@/modules/onboarding/actions";
import { PROFILE_FORM_SECTIONS, type ProfileFormSection } from "@/modules/onboarding/profile";
import { SAVE_IDLE, type SaveState } from "@/modules/onboarding/wizard";
import { sectionFromForm, sectionToForm, type SectionFormState } from "./form-spec";
import { PATIENT_SPECS } from "./section-specs";
import { ensureRow, SectionBlock } from "./section-block";
import { useSpecFormContext } from "./use-spec-form";

const IDENTITY: readonly ProfileFormSection[] = ["personal"];
const HEALTH: readonly ProfileFormSection[] = ["bloodGroup", "measurements", "allergies", "medicalHistory", "medicines", "surgeries"];

/**
 * Full "Edit profile" form: identity details, then the separate health record. Values stay in
 * memory until the user saves; the server action re-validates every section (Zod) and the draft
 * version is chained so a stale tab gets a conflict instead of overwriting.
 */
export function ProfileForm({
  initial,
  version,
  locale,
}: {
  initial: Partial<Record<ProfileFormSection, unknown>>;
  version: number;
  locale: string;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<SaveState, unknown>(saveProfileAction, SAVE_IDLE);
  const [forms, setForms] = useState<Record<ProfileFormSection, SectionFormState>>(() => {
    const out = {} as Record<ProfileFormSection, SectionFormState>;
    for (const s of PROFILE_FORM_SECTIONS) out[s] = ensureRow(PATIENT_SPECS[s], sectionToForm(PATIENT_SPECS[s], initial[s]));
    return out;
  });
  const [attempt, setAttempt] = useState(0);
  const { ctx, summary, statusText } = useSpecFormContext(state, pending);
  const currentVersion = state.status === "invalid" && state.version !== undefined ? state.version : state.status === "saved" ? state.version : version;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempt((n) => n + 1);
    const sections: Partial<Record<ProfileFormSection, unknown>> = {};
    for (const s of PROFILE_FORM_SECTIONS) sections[s] = sectionFromForm(PATIENT_SPECS[s], forms[s]);
    startTransition(() => dispatch({ sections, expectedVersion: currentVersion, locale }));
  }

  const block = (s: ProfileFormSection) => (
    <section key={s} aria-labelledby={s === "personal" ? "profile-identity-title" : `profile-${s}-title`} className={s === "personal" ? "grid gap-4" : "grid gap-4 border-t border-border pt-6"}>
      {s === "personal" ? null : (
        <h3 id={`profile-${s}-title`} className="text-xl font-semibold text-ink">
          {t(`patient.steps.${s}`)}
        </h3>
      )}
      <SectionBlock sectionId={s} spec={PATIENT_SPECS[s]} state={forms[s]} onState={(next) => setForms((f) => ({ ...f, [s]: next }))} ctx={ctx} />
    </section>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-10" aria-busy={pending}>
      <ErrorSummary errors={summary} focusKey={`${attempt}:${state.status}`} />
      {statusText && summary.length === 0 ? (
        <Notice role="alert" tone={state.status === "gated" ? "neutral" : "danger"} title={t("form.saveProblem")} action={
          state.status === "conflict" ? (
            <Button variant="secondary" onClick={() => router.refresh()}>
              {t("form.reload")}
            </Button>
          ) : undefined
        }>
          {statusText}
        </Notice>
      ) : null}

      <section aria-labelledby="profile-identity-title" className="grid gap-6">
        <h2 id="profile-identity-title" className="font-display text-2xl font-medium text-ink">
          {t("profile.identityTitle")}
        </h2>
        {IDENTITY.map(block)}
      </section>

      <section aria-labelledby="profile-health-title" className="grid gap-6">
        <div className="grid gap-3">
          <h2 id="profile-health-title" className="font-display text-2xl font-medium text-ink">
            {t("profile.healthTitle")}
          </h2>
          <Notice tone="warning" title={t("profile.unverifiedTitle")}>
            {t("profile.unverifiedBody")}
          </Notice>
          <Notice tone="info" title={t("profile.sharingTitle")}>
            {t("profile.sharingBody")}
          </Notice>
        </div>
        {HEALTH.map(block)}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? t("form.saving") : t("profile.save")}
        </Button>
        <p className="text-sm text-muted" aria-live="polite">
          {state.status === "saved" ? t("form.saved") : null}
        </p>
      </div>
    </form>
  );
}
