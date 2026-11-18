"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { OTPInput } from "@/components/shared/otp-input";
import { Button } from "@/components/ui/button";
import { secondsUntilResend, type OtpChallenge } from "@/modules/auth/schemas";
import type { SignupRole } from "@/modules/auth/roles";
import { translateKey, type RootTranslator } from "./message-key";
import { useNow } from "./use-now";

/**
 * OTP entry. The countdown is derived from server times (resendAvailableAt/serverNow) and is
 * advisory only; the server decides. The code lives in component state only: never in the
 * URL, storage or logs, and it is cleared when a new challenge arrives (component remounts).
 */
export function OtpStep({
  challenge,
  purpose,
  role,
  next,
  locale,
  errorKey,
  retryAfterSeconds,
  pending,
  formAction,
}: {
  challenge: OtpChallenge;
  purpose: "signup" | "login";
  role: SignupRole | null;
  next: string | null;
  locale: string;
  errorKey?: string;
  retryAfterSeconds?: number;
  pending: boolean;
  formAction: (fd: FormData) => void;
}) {
  const t = useTranslations("auth");
  const root = useTranslations() as unknown as RootTranslator;
  const format = useFormatter();
  const [code, setCode] = useState("");
  const [receivedAt] = useState(() => new Date());
  const now = useNow();
  const wait = now ? secondsUntilResend(challenge, now, receivedAt) : null;
  const exhausted = wait === Number.POSITIVE_INFINITY;
  const canResend = wait === 0 && !pending;
  const errorText = errorKey
    ? translateKey(root, retryAfterSeconds && errorKey === "auth.errors.rateLimited" ? "auth.errors.rateLimitedSeconds" : errorKey, "auth", "errors.api.generic", retryAfterSeconds ? { seconds: retryAfterSeconds } : undefined)
    : null;
  const codeId = "otp-code";
  const errorId = "otp-error";

  return (
    <form action={formAction} className="grid gap-6" aria-describedby={errorText ? errorId : undefined}>
      <div className="grid gap-2">
        <h2 className="font-display text-2xl font-medium text-ink">{t("otp.title")}</h2>
        <p className="text-base text-muted">{t("otp.sentTo", { destination: challenge.maskedDestination })}</p>
      </div>

      <input type="hidden" name="challengeId" value={challenge.challengeId} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="locale" value={locale} />
      {role ? <input type="hidden" name="role" value={role} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {errorText ? (
        <Notice id={errorId} role="alert" tone="danger" title={t("errors.summaryTitle")}>
          {errorText}
        </Notice>
      ) : null}

      <Field id={codeId} label={t("fields.code")} hint={t("fields.codeHint")} required>
        {(control) => (
          <OTPInput {...control} name="code" value={code} onValueChange={setCode} disabled={pending} autoFocus />
        )}
      </Field>

      <p className="text-sm text-muted">
        {t("otp.expiresAt", { time: format.dateTime(new Date(challenge.expiresAt), { timeStyle: "short" }) })}{" "}
        {t("otp.attemptsLeft", { count: challenge.attemptsRemaining })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="verify" disabled={pending || code.length !== 6} aria-busy={pending}>
          {t("otp.verify")}
        </Button>
        <Button type="submit" name="intent" value="resend" variant="secondary" disabled={!canResend}>
          {t("otp.resend")}
        </Button>
      </div>
      <p className="text-sm text-muted">
        {exhausted ? t("otp.resendExhausted") : wait && wait > 0 ? t("otp.resendIn", { seconds: wait }) : null}
      </p>
    </form>
  );
}
