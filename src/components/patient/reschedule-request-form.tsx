"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import type { ApiResult } from "@/lib/api/result";
import { checkReschedule, type RescheduleFieldError } from "./reschedule-request";

/** Today's date in India time, for the date picker minimum (display only; the server re-checks). */
function todayInKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Preferred new time, India time. B01 has no reschedule endpoint, so the server action answers
 * `gated` and nothing changes; the page says so before the patient fills anything in.
 */
export function RescheduleRequestForm({
  bookingId,
  expectedVersion,
  submit,
}: {
  bookingId: string;
  expectedVersion: number;
  submit: (input: { bookingId: string; expectedVersion: number; date: string; time: string }) => Promise<ApiResult<never>>;
}) {
  const t = useTranslations("patient.booking.reschedule");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [fieldError, setFieldError] = useState<RescheduleFieldError | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOutcome(null);
    const check = checkReschedule({ date, time }, new Date().toISOString());
    if (!check.ok) {
      setFieldError(check.error);
      return;
    }
    setFieldError(null);
    startTransition(async () => {
      const r = await submit({ bookingId, expectedVersion, date, time });
      setOutcome(r.ok ? "unknown" : r.error.code);
    });
  }

  const dateError = fieldError === "date" || fieldError === "past" ? t(`error.${fieldError}`) : undefined;
  const timeError = fieldError === "time" ? t("error.time") : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <GateNotice reason="contract_pending" title={t("gateTitle")}>
        {t("gateBody")}
      </GateNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="reschedule-date" label={t("date")} hint={t("dateHint")} error={dateError} required>
          {(p) => <Input {...p} type="date" min={todayInKolkata()} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field id="reschedule-time" label={t("time")} hint={t("timeHint")} error={timeError} required>
          {(p) => <Input {...p} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {outcome === "gated" ? (
          <Notice tone="neutral" title={t("notSentTitle")}>
            {t("notSentBody")}
          </Notice>
        ) : outcome ? (
          <InlineError code={outcome} />
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
