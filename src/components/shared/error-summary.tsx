"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export type SummaryError = { fieldId: string; message: string };

/**
 * Lists form errors after a failed submit, takes focus so screen readers announce it, and links each
 * item to its field. Re-focuses whenever `focusKey` changes (e.g. a submit attempt counter).
 */
export function ErrorSummary({ errors, focusKey }: { errors: SummaryError[]; focusKey?: number | string }) {
  const t = useTranslations("common.errorSummary");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only on new submit attempts
  }, [focusKey]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="rounded-md border-2 border-danger bg-danger-surface p-4 focus-visible:outline-3 focus-visible:outline-focus"
    >
      <h2 id="error-summary-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        {t("title", { count: errors.length })}
      </h2>
      <ul className="mt-2 grid gap-1 pl-7">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              className="inline-flex min-h-target items-center font-medium text-danger underline"
              onClick={(ev) => {
                const el = document.getElementById(e.fieldId);
                if (el) {
                  ev.preventDefault();
                  el.focus();
                  el.scrollIntoView({ block: "center" });
                }
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
