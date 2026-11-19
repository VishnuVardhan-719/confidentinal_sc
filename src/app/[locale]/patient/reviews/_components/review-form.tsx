"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Link, useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { validateReviewInput } from "@/modules/reviews/schemas";
import { RATINGS, REVIEW_ISSUES, REVIEW_TEXT_MAX, type Rating, type Review, type ReviewField, type ReviewIssue } from "@/modules/reviews/types";

/**
 * Star rating (native radio group: arrow keys move, each option has a text label) plus review text.
 * Validates with the server's rules, focuses an ErrorSummary on failure, one idempotency key per intent.
 */
export function ReviewForm({ bookingId, submit }: { bookingId: string; submit: (bookingId: string, input: unknown, key: string) => Promise<ApiResult<Review>> }) {
  const t = useTranslations("patientAccount.reviews.form");
  const router = useRouter();
  const base = useId();
  const ids: Record<ReviewField, string> = { rating: `${base}-rating-1`, text: `${base}-text` };
  const [rating, setRating] = useState<Rating | null>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);

  const fieldError = (f: ReviewField) => errors.find((e) => e.fieldId === ids[f])?.message;
  const toSummary = (issues: { field: ReviewField; code: ReviewIssue }[]) => issues.map((i) => ({ fieldId: ids[i.field], message: t(`errors.${i.code}`) }));
  const ratingError = fieldError("rating");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateReviewInput({ rating: rating ?? undefined, text });
    setAttempt((a) => a + 1);
    setApiError(null);
    if (!v.ok) return setErrors(toSummary(v.issues));
    setErrors([]);
    setBusy(true);
    key.current ??= globalThis.crypto.randomUUID();
    try {
      const r = await submit(bookingId, v.data, key.current);
      if (!r.ok) {
        const fields = r.error.fields ?? {};
        const issues = (["rating", "text"] as const)
          .filter((f) => (REVIEW_ISSUES as readonly string[]).includes(fields[f] ?? ""))
          .map((f) => ({ field: f, code: fields[f] as ReviewIssue }));
        if (r.error.code === "validation" && issues.length > 0) setErrors(toSummary(issues));
        else setApiError(r.error.code);
        return;
      }
      key.current = null;
      router.push("/patient/reviews?status=sent");
      router.refresh();
    } catch {
      setApiError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-form gap-6">
      <ErrorSummary errors={errors} focusKey={attempt} />
      <fieldset aria-describedby={`${base}-rating-hint${ratingError ? ` ${base}-rating-error` : ""}`} className="grid gap-2">
        <legend className="text-base font-semibold text-ink">{t("rating")}</legend>
        <p id={`${base}-rating-hint`} className="text-sm text-muted">
          {t("ratingHint")}
        </p>
        {ratingError ? (
          <p id={`${base}-rating-error`} className="text-sm font-medium text-danger">
            {ratingError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((r) => {
            const checked = rating === r;
            const label = t("ratingOption", { rating: r, label: t(`ratingLabels.${r}`) });
            return (
              <label
                key={r}
                className={cn(
                  "inline-flex min-h-target min-w-target cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
                  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  checked ? "border-forest bg-forest text-on-forest" : "border-border bg-surface text-ink hover:border-forest",
                )}
              >
                <input
                  id={`${base}-rating-${r}`}
                  type="radio"
                  name="rating"
                  value={r}
                  checked={checked}
                  onChange={() => setRating(r)}
                  className="sr-only"
                />
                <span aria-hidden className="flex">
                  {RATINGS.filter((s) => s <= r).map((s) => (
                    <Star key={s} className={cn("size-4", checked ? "fill-current text-on-forest" : "fill-current text-warning-text")} />
                  ))}
                </span>
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field id={ids.text} label={t("text")} hint={t("textHint")} required error={fieldError("text")}>
        {(control) => (
          <>
            <Textarea {...control} name="text" rows={6} maxLength={REVIEW_TEXT_MAX + 200} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-sm text-muted tabular">
              {t("count", { count: text.trim().length })}
            </p>
          </>
        )}
      </Field>
      {apiError ? <InlineError code={apiError} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("sending") : t("submit")}
        </Button>
        <Button asChild variant="quiet">
          <Link href="/patient/reviews">{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
