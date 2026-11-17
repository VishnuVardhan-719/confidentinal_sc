import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import type { ZodError } from "zod";

/** First message per field path from a Zod error, for display next to inputs. */
export function fieldErrors(error: ZodError | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error?.issues ?? []) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

type ControlProps = { id?: string; "aria-describedby"?: string; invalid?: boolean; required?: boolean };

type Props = {
  label: string;
  /** A single form control (Input, select, textarea). Receives id and aria wiring. */
  children?: ReactElement;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
};

export function FormField({ label, children, hint, error, required }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<ControlProps>, { id, "aria-describedby": describedBy, invalid: Boolean(error), required })
    : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--ink)]">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[var(--warning)]">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-[#40585b]">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
