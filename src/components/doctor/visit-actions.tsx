"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { OTPInput } from "@/components/shared/otp-input";
import { useClinicalFormat } from "@/components/clinical/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { interpretCommand } from "@/modules/doctor/loaders";
import { deriveChallengeView, OTP_ERROR_LABEL_KEYS } from "@/modules/doctor/otp";
import { useHydrated } from "@/components/clinical/use-hydrated";
import { otpCodeSchema, type ArrivalChallenge, type OtpErrorCode, type VerifyArrivalOutcome, type VersionResponse } from "@/modules/doctor/types";
import type { VisitAction } from "@/modules/doctor/visit";
import { outcomeMessageKey } from "./command-message";

type Actions = {
  advance: (bookingId: string, step: "en_route" | "arrive" | "start", expectedVersion: number) => Promise<ApiResult<VersionResponse>>;
  verify: (bookingId: string, challengeId: string, code: string) => Promise<ApiResult<VerifyArrivalOutcome>>;
  resend: (bookingId: string) => Promise<ApiResult<ArrivalChallenge>>;
};

/**
 * Next-step panel for a visit: travel, arrival code, start consultation. One primary action at a
 * time, derived from server state. Every action waits for the server, then refetches the page.
 */
export function VisitNextStep({
  bookingId,
  version,
  allowed,
  consultationId,
  challenge,
  challengeError,
  actions,
}: {
  bookingId: string;
  version: number;
  allowed: VisitAction[];
  consultationId: string | null;
  challenge: ArrivalChallenge | null;
  challengeError: boolean;
  actions: Actions;
}) {
  const t = useTranslations("doctor.visit");
  const { tk } = useClinicalFormat();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code?: string; message?: string } | null>(null);
  const next = allowed[0];

  async function advance(step: "en_route" | "arrive" | "start") {
    setBusy(true);
    setError(null);
    try {
      const result = await actions.advance(bookingId, step, version);
      const outcome = interpretCommand(result, step);
      if (outcome.kind === "done" || outcome.kind === "refresh") {
        if (outcome.kind === "refresh") setError({ message: tk(outcomeMessageKey(outcome)) });
        startTransition(() => (step === "start" && outcome.kind === "done" ? router.push(`/doctor/visits/${bookingId}/consultation`) : router.refresh()));
      } else {
        setError({ code: result.ok ? undefined : result.error.code, message: tk(outcomeMessageKey(outcome)) });
      }
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  return (
    <div className="grid gap-4">
      {error ? <InlineError code={error.code} message={error.message} /> : null}
      {next === "en_route" ? (
        <StepButton label={t("onTheWay")} hint={t("onTheWayHint")} busy={working} onClick={() => advance("en_route")} />
      ) : next === "arrive" ? (
        <StepButton label={t("arrived")} hint={t("arrivedHint")} busy={working} onClick={() => advance("arrive")} />
      ) : next === "verify_arrival" ? (
        challenge ? (
          <ArrivalCodeForm bookingId={bookingId} challenge={challenge} actions={actions} />
        ) : (
          <Notice tone={challengeError ? "danger" : "info"}>{challengeError ? tk("doctor.arrival.loadError") : tk("doctor.arrival.error.noActiveChallenge")}</Notice>
        )
      ) : next === "start_consultation" ? (
        <StepButton label={t("startConsultation")} hint={t("startHint")} busy={working} onClick={() => advance("start")} />
      ) : next === "open_consultation" && consultationId ? (
        <div>
          <Button asChild>
            <Link href={`/doctor/visits/${bookingId}/consultation`}>
              {t("openConsultation")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted">{t("noAction")}</p>
      )}
    </div>
  );
}

function StepButton({ label, hint, busy, onClick }: { label: string; hint: string; busy: boolean; onClick: () => void }) {
  const tc = useTranslations("common.actions");
  return (
    <div className="grid justify-items-start gap-2">
      <Button size="lg" onClick={onClick} disabled={busy} aria-busy={busy}>
        {busy ? tc("working") : label}
      </Button>
      <p className="text-sm text-muted">{hint}</p>
    </div>
  );
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * DC02 doctor-side code entry. The doctor never sees the code; the typed digits live only in this
 * component's state and are cleared after every submit. Expiry/attempts/resend come from the
 * server challenge; the countdown is advisory.
 */
function ArrivalCodeForm({ bookingId, challenge: initial, actions }: { bookingId: string; challenge: ArrivalChallenge; actions: Actions }) {
  const t = useTranslations("doctor.arrival");
  const tc = useTranslations("common.actions");
  const { tk } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fieldId = useId();
  const now = useNow(1000);
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [formatError, setFormatError] = useState<string | undefined>();
  const [error, setError] = useState<{ otp?: OtpErrorCode; api?: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = deriveChallengeView(challenge, now);
  const hydrated = useHydrated();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    if (!otpCodeSchema.safeParse(code).success) {
      setFormatError(t("codeFormat"));
      document.getElementById(fieldId)?.focus();
      return;
    }
    setFormatError(undefined);
    setBusy(true);
    const typed = code;
    setCode(""); // never keep the code after submit
    try {
      const r = await actions.verify(bookingId, challenge.challengeId, typed);
      if (!r.ok) {
        setError(r.error.code === "forbidden" ? { otp: "wrong_doctor" } : { api: r.error.code });
        return;
      }
      if (r.data.result === "verified") {
        setError(null);
        setInfo(t("verified"));
        startTransition(() => router.refresh());
        return;
      }
      setChallenge(r.data.challenge);
      setError({ otp: r.data.reason });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setInfo(null);
    try {
      const r = await actions.resend(bookingId);
      if (!r.ok) {
        setError(r.error.code === "rate_limited" ? { otp: "resend_limited" } : { api: r.error.code });
        return;
      }
      setChallenge(r.data);
      setError(null);
      setInfo(t("newCode"));
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.floor(view.secondsLeft / 60);
  const seconds = String(view.secondsLeft % 60).padStart(2, "0");
  // When the challenge is locked the phase line already says "Too many attempts"; don't repeat it on the field.
  const duplicatesPhase = error?.otp === "attempts_exhausted" && view.phase === "locked";
  const errorText = error?.otp && !duplicatesPhase ? tk(OTP_ERROR_LABEL_KEYS[error.otp]) : undefined;

  return (
    <form onSubmit={submit} noValidate className="grid gap-5" aria-labelledby={`${fieldId}-title`}>
      <div className="grid gap-2">
        <h3 id={`${fieldId}-title`} className="text-lg font-semibold text-ink">
          {t("title")}
        </h3>
        <p className="text-base text-ink">{t("instructions")}</p>
        <p className="text-sm text-muted">{t("safety")}</p>
      </div>
      <Field id={fieldId} label={t("codeLabel")} hint={t("codeHint")} required error={formatError ?? errorText}>
        {(control) => (
          <OTPInput {...control} value={code} onValueChange={setCode} disabled={!view.canSubmit || busy || !hydrated} />
        )}
      </Field>
      <div aria-live="polite" className="grid gap-1 text-sm tabular">
        {view.phase === "enter_code" ? (
          <>
            <span className="text-ink">{t("expiresIn", { minutes, seconds })}</span>
            <span className="text-muted">{t("attemptsLeft", { count: view.attemptsRemaining })}</span>
          </>
        ) : (
          <span className="font-medium text-ink">{tk(`doctor.arrival.phase.${view.phase}`)}</span>
        )}
        {info ? <span className="font-medium text-forest">{info}</span> : null}
      </div>
      {error?.api ? <InlineError code={error.api} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!view.canSubmit || busy} aria-busy={busy}>
          {busy ? tc("working") : t("verify")}
        </Button>
        <Button type="button" variant="secondary" onClick={resend} disabled={!view.canResend || busy}>
          {t("resend")}
        </Button>
        {!view.canResend && view.resendInSeconds > 0 ? <span className="text-sm text-muted tabular">{t("resendIn", { seconds: view.resendInSeconds })}</span> : null}
      </div>
    </form>
  );
}
