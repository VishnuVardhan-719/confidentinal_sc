"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

export type SummaryError = { fieldId: string; message: string };

const FORM_CONTROL = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";
const FOCUSABLE = `${FORM_CONTROL}, button:not([disabled]), [tabindex]:not([tabindex='-1'])`;

/**
 * Lists form errors after a failed submit, takes focus so screen readers announce it, and links each
 * item to its field. Re-focuses whenever `focusKey` changes (e.g. a submit attempt counter).
 */
export function ErrorSummary({ errors, focusKey }: { errors: SummaryError[]; focusKey?: number | string }) {
  const t = useTranslations("common.errorSummary");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

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
      aria-labelledby={titleId}
      className="rounded-md border-2 border-danger bg-danger-surface p-4 focus-visible:outline-3 focus-visible:outline-focus"
    >
      <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold text-ink">
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
                  // Group errors (fieldset, list editor) point at a non-focusable wrapper: focus its
                  // first form control, else its first other focusable element.
                  const target = el.matches(FOCUSABLE)
                    ? el
                    : (el.querySelector<HTMLElement>(FORM_CONTROL) ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el);
                  target.focus();
                  target.scrollIntoView({ block: "center" });
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
