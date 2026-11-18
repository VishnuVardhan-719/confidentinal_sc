import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

/**
 * Label + hint + error wiring. The render-prop receives the ids/aria attributes for the control so
 * the error is programmatically linked (WCAG 1.3.1 / 3.3.1).
 */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Already-localized error message. */
  error?: string;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const t = useTranslations("common.field");
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={id} className="text-base font-semibold text-ink">
        {label}
        {required ? null : <span className="ml-2 text-sm font-normal text-muted">{t("optional")}</span>}
      </label>
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(required ? { "aria-required": true as const } : {}),
      })}
    </div>
  );
}

export function FormSection({
  legend,
  description,
  children,
  className,
}: {
  legend: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("grid gap-5 border-t border-border pt-6", className)}>
      <legend className="float-left mb-1 w-full font-display text-xl font-medium text-ink">{legend}</legend>
      {description ? <p className="clear-both -mt-2 text-base text-muted">{description}</p> : null}
      <div className="clear-both grid gap-5">{children}</div>
    </fieldset>
  );
}
