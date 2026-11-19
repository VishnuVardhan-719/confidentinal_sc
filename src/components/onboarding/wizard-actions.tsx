"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { translateKey, type RootTranslator } from "@/components/auth/message-key";
import { ErrorSummary } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderCategory } from "@/modules/auth/roles";
import { createProviderAction, submitPatientQuestionnaireAction, submitProviderAction } from "@/modules/onboarding/actions";
import type { CreateProviderState, SubmitState } from "@/modules/onboarding/flows";
import { fieldDomId } from "./form-spec";

const SUBMIT_IDLE: SubmitState = { status: "idle" };
const CREATE_IDLE: CreateProviderState = { status: "idle" };

function SubmitFeedback({ state, ns }: { state: SubmitState; ns: "patientWizard" | "providerWizard" }) {
  const t = useTranslations("onboarding");
  const root = useTranslations() as unknown as RootTranslator;
  if (state.status === "incomplete") {
    return (
      <Notice role="alert" tone="warning" title={t("form.saveProblem")}>
        {t(`${ns}.incomplete`)}
      </Notice>
    );
  }
  if (state.status === "gated") {
    return (
      <Notice role="alert" tone="neutral" icon="lock">
        {t(`${ns}.submitUnavailable`)}
      </Notice>
    );
  }
  if (state.status === "error") {
    return (
      <Notice role="alert" tone="danger" title={t("form.saveProblem")}>
        {translateKey(root, state.errorKey, "onboarding", "errors.api.generic")}
      </Notice>
    );
  }
  return null;
}

/** Final patient submit. Enabled only when the server says every required step (incl. consent) is saved. */
export function PatientSubmit({ ready, locale }: { ready: boolean; locale: string }) {
  const t = useTranslations("onboarding.patientWizard");
  const [state, dispatch, pending] = useActionState<SubmitState, unknown>(submitPatientQuestionnaireAction, SUBMIT_IDLE);
  return (
    <div className="grid gap-3">
      <SubmitFeedback state={state} ns="patientWizard" />
      <div>
        <Button size="lg" disabled={!ready || pending} aria-busy={pending} onClick={() => startTransition(() => dispatch({ locale }))}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
      {ready ? null : <p className="text-sm text-muted">{t("submitHint")}</p>}
    </div>
  );
}

/** Provider submit for verification. The draft version guards against a stale tab. */
export function ProviderSubmit({
  ready,
  locale,
  category,
  providerId,
  version,
}: {
  ready: boolean;
  locale: string;
  category: ProviderCategory;
  providerId: string;
  version: number;
}) {
  const t = useTranslations("onboarding.providerWizard");
  const [state, dispatch, pending] = useActionState<SubmitState, unknown>(submitProviderAction, SUBMIT_IDLE);
  return (
    <div className="grid gap-3">
      <SubmitFeedback state={state} ns="providerWizard" />
      <div>
        <Button
          size="lg"
          disabled={!ready || pending}
          aria-busy={pending}
          onClick={() => startTransition(() => dispatch({ locale, category, providerId, expectedVersion: version }))}
        >
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
      {ready ? null : <p className="text-sm text-muted">{t("submitHint")}</p>}
    </div>
  );
}

/** First step for a signed-in user without a provider of this category: create the draft. */
export function StartApplication({ category, locale }: { category: ProviderCategory; locale: string }) {
  const t = useTranslations("onboarding");
  const root = useTranslations() as unknown as RootTranslator;
  const [state, dispatch, pending] = useActionState<CreateProviderState, unknown>(createProviderAction, CREATE_IDLE);
  const [displayName, setDisplayName] = useState("");
  const [attempt, setAttempt] = useState(0);
  const id = fieldDomId("listing.displayName");
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const nameError = fieldErrors.displayName ? translateKey(root, fieldErrors.displayName, "onboarding", "onboarding.fieldErrors.invalid") : undefined;
  const summary = Object.entries(fieldErrors).map(([path, key]) => ({
    fieldId: path === "displayName" ? id : fieldDomId(path),
    message: translateKey(root, key, "onboarding", "onboarding.fieldErrors.invalid"),
  }));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempt((n) => n + 1);
    startTransition(() => dispatch({ category, displayName, locale }));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-form gap-6" aria-busy={pending}>
      <div className="grid gap-2">
        <h2 className="font-display text-2xl font-medium text-ink">{t("providerWizard.startTitle")}</h2>
        <p className="text-base text-muted">{t("providerWizard.startLead")}</p>
      </div>
      <ErrorSummary errors={summary} focusKey={`${attempt}:${state.status}`} />
      {state.status === "error" ? (
        <Notice role="alert" tone="danger" title={t("form.saveProblem")}>
          {translateKey(root, state.errorKey, "onboarding", "errors.api.generic")}
        </Notice>
      ) : null}
      <Field id={id} label={t("fields.common.displayName")} hint={t("fields.common.displayNameHint")} error={nameError} required>
        {(control) => (
          <Input {...control} value={displayName} maxLength={120} autoComplete="organization" onChange={(e) => setDisplayName(e.target.value)} />
        )}
      </Field>
      <div>
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? t("providerWizard.starting") : t("providerWizard.start")}
        </Button>
      </div>
    </form>
  );
}
