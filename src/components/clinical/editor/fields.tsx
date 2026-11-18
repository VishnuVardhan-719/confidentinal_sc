"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Checkbox, RadioGroup, RadioGroupItem } from "@/components/ui/checkbox";
import { Input, Textarea, fieldControlClass } from "@/components/ui/input";
import { Field } from "@/components/shared/field";

/** Number field that keeps the typed text (e.g. "37.") and only reports parseable values. */
export function NumberField({
  id,
  label,
  value,
  onValue,
  integer = false,
  max,
  disabled,
  suffix,
  externalError,
}: {
  id: string;
  label: string;
  value: number | null | undefined;
  onValue: (v: number | undefined) => void;
  integer?: boolean;
  /** Structural schema bound (e.g. SpO2 100); not a clinical threshold. */
  max?: number;
  disabled?: boolean;
  suffix?: ReactNode;
  externalError?: string;
}) {
  const t = useTranslations("clinical.vitals");
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  const [error, setError] = useState<string | undefined>();
  const pattern = integer ? /^\d{1,4}$/ : /^\d{1,4}(\.\d{1,2})?$/;
  return (
    <Field id={id} label={label} error={error ?? externalError}>
      {(control) => (
        <div className="flex items-center gap-2">
          <Input
            {...control}
            inputMode={integer ? "numeric" : "decimal"}
            autoComplete="off"
            className="max-w-32 tabular"
            value={text}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value.trim();
              setText(e.target.value);
              if (raw === "") {
                setError(undefined);
                onValue(undefined);
              } else if (!pattern.test(raw)) {
                setError(integer ? t("wholeNumber") : t("invalidNumber"));
              } else if (max !== undefined && Number(raw) > max) {
                setError(t("maxValue", { max }));
              } else {
                setError(undefined);
                onValue(Number(raw));
              }
            }}
          />
          {suffix}
        </div>
      )}
    </Field>
  );
}

export function DateField({ id, label, value, onValue, disabled }: { id: string; label: string; value: string | undefined; onValue: (v: string | undefined) => void; disabled?: boolean }) {
  return (
    <Field id={id} label={label}>
      {(control) => <Input {...control} type="date" className="max-w-56" value={value ?? ""} disabled={disabled} onChange={(e) => onValue(e.target.value || undefined)} />}
    </Field>
  );
}

export function TextField({ id, label, hint, value, onValue, disabled, required, error, maxLength = 2000 }: { id: string; label: string; hint?: string; value: string | undefined; onValue: (v: string) => void; disabled?: boolean; required?: boolean; error?: string; maxLength?: number }) {
  return (
    <Field id={id} label={label} hint={hint} required={required} error={error}>
      {(control) => <Input {...control} value={value ?? ""} maxLength={maxLength} disabled={disabled} onChange={(e) => onValue(e.target.value)} />}
    </Field>
  );
}

export function LongTextField({ id, label, hint, value, onValue, disabled, required, error, rows = 4, maxLength = 4000 }: { id: string; label: string; hint?: string; value: string | undefined; onValue: (v: string) => void; disabled?: boolean; required?: boolean; error?: string; rows?: number; maxLength?: number }) {
  return (
    <Field id={id} label={label} hint={hint} required={required} error={error}>
      {(control) => <Textarea {...control} rows={rows} value={value ?? ""} maxLength={maxLength} disabled={disabled} onChange={(e) => onValue(e.target.value)} />}
    </Field>
  );
}

export function SelectField<V extends string>({ id, label, value, options, onValue, disabled, required, error, placeholder }: { id: string; label: string; value: V | "" | undefined; options: { value: V; label: string }[]; onValue: (v: V | "") => void; disabled?: boolean; required?: boolean; error?: string; placeholder?: string }) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      {(control) => (
        <select {...control} className={`${fieldControlClass} max-w-xs`} value={value ?? ""} disabled={disabled} onChange={(e) => onValue(e.target.value as V | "")}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Radio set with a visible legend; each option label spans the 44px target. */
export function ChoiceField<V extends string>({ id, legend, value, options, onValue, disabled, error }: { id: string; legend: string; value: V | undefined; options: { value: V; label: string; hint?: string }[]; onValue: (v: V) => void; disabled?: boolean; error?: string }) {
  return (
    <fieldset id={id} tabIndex={-1} className="grid gap-2 outline-none focus-visible:outline-3 focus-visible:outline-focus" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-base font-semibold text-ink">{legend}</legend>
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <RadioGroup value={value ?? ""} onValueChange={(v) => onValue(v as V)} disabled={disabled} aria-invalid={error ? true : undefined}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-target cursor-pointer items-start gap-3 rounded-md px-1 py-2 hover:bg-mist/60">
            <RadioGroupItem value={o.value} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-ink">{o.label}</span>
              {o.hint ? <span className="text-sm text-muted">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

export function CheckField({ id, label, checked, onChecked, disabled, error }: { id: string; label: string; checked: boolean; onChecked: (v: boolean) => void; disabled?: boolean; error?: string }) {
  return (
    <div className="grid gap-1">
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <label htmlFor={id} className="flex min-h-target cursor-pointer items-start gap-3 py-2">
        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChecked(v === true)} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} className="mt-0.5" />
        <span className="text-ink">{label}</span>
      </label>
    </div>
  );
}
