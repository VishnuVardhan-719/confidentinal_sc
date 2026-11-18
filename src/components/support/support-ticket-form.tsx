"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";
import type { ApiResult } from "@/lib/api/result";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { fieldControlClass } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { looksSensitive, TICKET_CATEGORIES, TICKET_DESCRIPTION_MAX, validateTicket, type TicketDraft, type TicketErrors, type TicketInput } from "./ticket";

export type TicketBookingOption = { id: string; label: string };
export type TicketSubmitResult = ApiResult<{ reference: string | null }>;

/**
 * Raise a support ticket (client island; wrap in <IntlScope namespaces={["support"]}>).
 * Nonclinical only: no health-detail fields, no attachments, a soft warning for OTP-like numbers.
 * The caller's `onSubmit` performs the idempotent request; the reference shown comes from the server.
 */
export function SupportTicketForm({
  bookings = [],
  defaultBookingId = "",
  onSubmit,
}: {
  bookings?: TicketBookingOption[];
  defaultBookingId?: string;
  onSubmit: (input: TicketInput) => Promise<TicketSubmitResult>;
}) {
  const t = useTranslations("support.form");
  const id = useId();
  const [draft, setDraft] = useState<TicketDraft>({ category: "", bookingId: defaultBookingId, description: "" });
  const [errors, setErrors] = useState<TicketErrors>({});
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string | null } | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const ids = { category: `${id}-category`, bookingId: `${id}-booking`, description: `${id}-description` };
  const bookingIds = bookings.map((b) => b.id);
  const length = draft.description.trim().length;

  const errorText = (field: keyof TicketErrors): string | undefined => {
    switch (errors[field] && field) {
      case "category":
        return t("errors.category.required");
      case "bookingId":
        return t("errors.bookingId.invalid");
      case "description":
        return errors.description === "tooLong"
          ? t("errors.description.tooLong", { max: TICKET_DESCRIPTION_MAX })
          : t("errors.description.required");
      default:
        return undefined;
    }
  };

  const summary: SummaryError[] = (["category", "bookingId", "description"] as const)
    .filter((field) => errors[field])
    .map((field) => ({
      fieldId: field === "category" ? `${ids.category}-${TICKET_CATEGORIES[0]}` : ids[field],
      message: errorText(field)!,
    }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const result = validateTicket(draft, bookingIds);
    setAttempt((n) => n + 1);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setServerError(null);
    setPending(true);
    try {
      const res = await onSubmit(result.input);
      if (res.ok) {
        setDone({ reference: res.data.reference });
        requestAnimationFrame(() => doneRef.current?.focus());
      } else {
        setServerError(res.error.code);
      }
    } catch {
      setServerError("unavailable");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="grid gap-4 rounded-lg border border-success/30 bg-success-surface p-5 outline-none">
        <p className="flex items-center gap-2 text-lg font-semibold text-ink">
          <CheckCircle2 aria-hidden className="size-5 text-success" />
          {t("success.title")}
        </p>
        <p className="text-base text-ink">{done.reference ? t("success.reference", { reference: done.reference }) : t("success.noReference")}</p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null);
              setDraft({ category: "", bookingId: defaultBookingId, description: "" });
            }}
          >
            {t("success.another")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="grid max-w-form gap-6" aria-busy={pending}>
      <ErrorSummary errors={summary} focusKey={attempt} />

      <Notice tone="info" icon="info" title={t("privacyTitle")}>
        {t("privacyBody")}
      </Notice>

      <fieldset className="grid gap-2" aria-describedby={errors.category ? `${ids.category}-error` : undefined}>
        <legend className="mb-2 text-base font-semibold text-ink">{t("category")}</legend>
        {errors.category ? (
          <p id={`${ids.category}-error`} className="text-sm font-medium text-danger">
            {errorText("category")}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {TICKET_CATEGORIES.map((c) => (
            <label
              key={c}
              htmlFor={`${ids.category}-${c}`}
              className={cn(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-surface p-3 hover:border-forest",
                "has-[:checked]:border-forest has-[:checked]:bg-mist has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              )}
            >
              <input
                id={`${ids.category}-${c}`}
                type="radio"
                name={`${id}-category`}
                value={c}
                checked={draft.category === c}
                onChange={() => setDraft((d) => ({ ...d, category: c }))}
                className="mt-1 size-5 shrink-0 accent-forest"
              />
              <span className="grid">
                <span className="font-semibold text-ink">{t(`categories.${c}.label`)}</span>
                <span className="text-sm text-muted">{t(`categories.${c}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {bookings.length > 0 ? (
        <Field id={ids.bookingId} label={t("booking")} hint={t("bookingHint")} error={errorText("bookingId")}>
          {(p) => (
            <select {...p} value={draft.bookingId} onChange={(e) => setDraft((d) => ({ ...d, bookingId: e.target.value }))} className={fieldControlClass}>
              <option value="">{t("bookingNone")}</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Field
        id={ids.description}
        label={t("description")}
        hint={t("descriptionHint", { max: TICKET_DESCRIPTION_MAX })}
        error={errorText("description")}
        required
      >
        {(p) => (
          <Textarea
            {...p}
            rows={6}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        )}
      </Field>
      <div className="-mt-4 grid gap-2">
        <p className={cn("text-sm tabular", length > TICKET_DESCRIPTION_MAX ? "font-medium text-danger" : "text-muted")} aria-live="polite">
          {t("count", { count: length, max: TICKET_DESCRIPTION_MAX })}
        </p>
        {looksSensitive(draft.description) ? (
          <p className="flex items-start gap-2 text-sm font-medium text-warning-text" role="status">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("sensitiveWarning")}
          </p>
        ) : null}
      </div>

      {serverError ? <InlineError code={serverError} /> : null}

      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
