"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { PhoneInput } from "@/components/shared/phone-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { authStepAction } from "@/modules/auth/actions";
import { IDLE, type AuthFormState } from "@/modules/auth/flows";
import { SIGNUP_ROLES, type SignupRole } from "@/modules/auth/roles";
import { OtpStep } from "./otp-step";
import { translateKey, type RootTranslator } from "./message-key";
import { HydrationStatus, hydrationBusy } from "@/components/clinical/hydration-status";
import { useHydrated } from "./use-hydrated";

type Mode = "login" | "signup";
type Method = "email_password" | "phone_otp";

/** Maps validation paths from the flow core to field element IDs (for ErrorSummary links). */
const FIELD_IDS: Record<string, (mode: Mode) => string> = {
  email: (m) => `${m}-email`,
  password: (m) => `${m}-password`,
  phone: (m) => `${m}-phone`,
  acceptedTerms: (m) => `${m}-terms`,
  termsVersion: (m) => `${m}-terms`,
  role: (m) => `${m}-role-${SIGNUP_ROLES[0]}`,
};

/**
 * Login and signup in one island driven by `authStepAction` (works as a plain form post
 * without JS). Passwords are never echoed back; OTP codes never leave component state.
 */
export function AuthFlow({
  mode,
  locale,
  next,
  initialRole,
  termsVersion,
  termsHref,
  privacyHref,
}: {
  mode: Mode;
  locale: string;
  next: string | null;
  initialRole?: SignupRole | null;
  termsVersion?: string;
  termsHref?: string;
  privacyHref?: string;
}) {
  const t = useTranslations("auth");
  const root = useTranslations() as unknown as RootTranslator;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(authStepAction, IDLE);
  const [method, setMethod] = useState<Method>("email_password");
  const [phone, setPhone] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Shared by the Email and Mobile tabs so switching method keeps the chosen role.
  const [role, setRole] = useState<string>(initialRole ?? "");
  // Radix radios are buttons: before hydration a tap does nothing. Show them disabled and the
  // group busy until React can hold the choice (ADVERSARIAL_REVIEW R6-1).
  const hydrated = useHydrated();

  if (state.status === "otp") {
    return (
      <OtpStep
        key={state.challenge.challengeId}
        challenge={state.challenge}
        purpose={state.purpose}
        role={state.role}
        next={state.next}
        locale={locale}
        errorKey={state.errorKey}
        retryAfterSeconds={state.retryAfterSeconds}
        pending={pending}
        formAction={formAction}
      />
    );
  }

  if (state.status === "check_email") {
    return (
      <Notice tone="info" title={t("signup.checkEmailTitle")} role="status">
        <p>{t("signup.checkEmailBody", { email: state.email })}</p>
        <p className="mt-3">
          <Link href="/login" className="font-semibold text-forest underline underline-offset-4">
            {t("signup.signIn")}
          </Link>
        </p>
      </Notice>
    );
  }

  const error = state.status === "error" ? state : null;
  const values = error?.values ?? {};
  const fieldError = (path: string) => {
    const key = error?.fieldErrors[path];
    return key ? translateKey(root, key, "auth", "auth.fieldErrors.invalid") : undefined;
  };
  const summary: SummaryError[] = Object.keys(error?.fieldErrors ?? {})
    .filter((path) => FIELD_IDS[path])
    .map((path) => ({ fieldId: FIELD_IDS[path](mode), message: fieldError(path) ?? "" }));
  const topError =
    error && summary.length === 0
      ? translateKey(
          root,
          error.retryAfterSeconds && error.errorKey === "auth.errors.rateLimited" ? "auth.errors.rateLimitedSeconds" : error.errorKey,
          "auth",
          "errors.api.generic",
          error.retryAfterSeconds ? { seconds: error.retryAfterSeconds } : undefined,
        )
      : null;

  const common = (
    <>
      <input type="hidden" name="intent" value={mode} />
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
    </>
  );

  const roleField =
    mode === "signup" ? (
      <fieldset className="grid gap-3" {...hydrationBusy(hydrated)}>
        <legend className="text-base font-semibold text-ink">{t("signup.roleLegend")}</legend>
        <HydrationStatus hydrated={hydrated} />
        <p className="-mt-1 text-sm text-muted">{t("signup.roleHint")}</p>
        {fieldError("role") ? <p className="text-sm font-medium text-danger">{fieldError("role")}</p> : null}
        <RadioGroup name="role" value={role || values.role || ""} onValueChange={setRole} disabled={!hydrated} className="grid gap-2 sm:grid-cols-2">
          {SIGNUP_ROLES.map((role) => (
            <label
              key={role}
              htmlFor={`${mode}-role-${role}`}
              className="flex min-h-target cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 has-[[data-state=checked]]:border-forest has-[[data-state=checked]]:bg-mist"
            >
              <RadioGroupItem id={`${mode}-role-${role}`} value={role} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-semibold text-ink">{t(`roles.${role}`)}</span>
                <span className="text-sm text-muted">{t(`roleHints.${role}`)}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
    ) : null;

  const consentField =
    mode === "signup" ? (
      <div className="grid gap-2">
        <input type="hidden" name="termsVersion" value={termsVersion ?? ""} />
        <label htmlFor={`${mode}-terms`} className="flex min-h-target cursor-pointer items-start gap-3">
          <Checkbox id={`${mode}-terms`} name="acceptedTerms" aria-invalid={fieldError("acceptedTerms") ? true : undefined} className="mt-0.5" />
          <span className="text-base text-ink">{t("signup.termsLabel")}</span>
        </label>
        <p className="pl-8 text-sm text-muted">
          {t("signup.termsHint")}{" "}
          {termsHref ? (
            <Link href={termsHref} className="text-forest underline underline-offset-4">
              {t("signup.termsLink")}
            </Link>
          ) : null}{" "}
          {privacyHref ? (
            <Link href={privacyHref} className="text-forest underline underline-offset-4">
              {t("signup.privacyLink")}
            </Link>
          ) : null}
        </p>
        {fieldError("acceptedTerms") ? <p className="pl-8 text-sm font-medium text-danger">{fieldError("acceptedTerms")}</p> : null}
      </div>
    ) : null;

  const onSubmit = () => setAttempt((n) => n + 1);
  const submitLabel = mode === "login" ? t("login.submit") : t("signup.submit");
  const sendCodeLabel = mode === "login" ? t("login.sendCode") : t("signup.sendCode");

  return (
    <div className="grid gap-6">
      <ErrorSummary errors={summary} focusKey={`${attempt}:${state.status}`} />
      {topError ? (
        <Notice role="alert" tone="danger" title={t("errors.summaryTitle")}>
          {topError}
        </Notice>
      ) : null}

      <Tabs value={method} onValueChange={(v) => setMethod(v === "phone_otp" ? "phone_otp" : "email_password")}>
        <TabsList aria-label={mode === "login" ? t("login.methodLabel") : t("signup.methodLabel")}>
          <TabsTrigger value="email_password">{t("login.emailTab")}</TabsTrigger>
          <TabsTrigger value="phone_otp">{t("login.phoneTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="email_password">
          <form action={formAction} onSubmit={onSubmit} className="grid gap-6" noValidate>
            {common}
            <input type="hidden" name="method" value="email_password" />
            {roleField}
            <Field id={`${mode}-email`} label={t("fields.email")} hint={t("fields.emailHint")} error={fieldError("email")} required>
              {(control) => (
                <Input {...control} name="email" type="email" autoComplete="email" inputMode="email" defaultValue={values.email ?? ""} spellCheck={false} />
              )}
            </Field>
            <Field
              id={`${mode}-password`}
              label={t("fields.password")}
              hint={mode === "signup" ? t("fields.newPasswordHint") : undefined}
              error={fieldError("password")}
              required
            >
              {(control) => (
                <Input {...control} name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              )}
            </Field>
            {consentField}
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
                {submitLabel}
              </Button>
              {mode === "login" ? (
                <Link href="/recover" className="inline-flex min-h-target items-center text-forest underline underline-offset-4">
                  {t("login.forgot")}
                </Link>
              ) : null}
            </div>
          </form>
        </TabsContent>

        <TabsContent value="phone_otp">
          <form action={formAction} onSubmit={onSubmit} className="grid gap-6" noValidate>
            {common}
            <input type="hidden" name="method" value="phone_otp" />
            <input type="hidden" name="phone" value={phone ? `+91${phone}` : ""} />
            {roleField}
            <Field id={`${mode}-phone`} label={t("fields.phone")} hint={t("fields.phoneHint")} error={fieldError("phone")} required>
              {(control) => <PhoneInput {...control} value={phone} onValueChange={setPhone} />}
            </Field>
            {consentField}
            <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className="w-fit">
              {sendCodeLabel}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
