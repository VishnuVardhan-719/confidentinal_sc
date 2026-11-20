"use client";

import { useId, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { fieldErrors } from "@/components/ui/form-field";
import { Input, type InputProps } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";

type FieldValue = string | string[] | boolean;
type KeysOf<V, T> = { [K in keyof V]: V[K] extends T ? K : never }[keyof V] & string;

/*
 * Local form state validated by a Zod schema. Errors appear after a field is first left (blur) and then
 * update as the person types, so nobody is scolded before they finish a field. A submit attempt marks
 * every field as touched.
 */
export function useZodForm<V extends Record<string, FieldValue>>(schema: ZodType, initial: V) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const parsed = schema.safeParse(values);
  const all = parsed.success ? {} : fieldErrors(parsed.error);

  const setValue = <K extends keyof V>(name: K, value: V[K]) => {
    setValues((v) => ({ ...v, [name]: value }));
    setServerErrors((e) => (name in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== name)) : e));
  };
  const touch = (name: keyof V) => setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
  const touchAll = () => setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])) as Record<keyof V, boolean>);

  return {
    values,
    setValue,
    touch,
    touchAll,
    setServerErrors,
    complete: parsed.success,
    /** Number of fields with a client-side error, touched or not. */
    errorCount: Object.keys(all).length,
    errorFor: (name: keyof V & string): string | undefined => (touched[name] ? all[name] : undefined) ?? serverErrors[name],
    bind: (name: KeysOf<V, string>, format?: (raw: string) => string) => ({
      name,
      value: values[name] as string,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setValue(name, (format ? format(e.target.value) : e.target.value) as V[typeof name]),
      onBlur: () => touch(name),
    }),
    /** Add or remove one option in a multi-choice (checkbox) field. */
    toggle: (name: KeysOf<V, string[]>, option: string) => {
      const list = values[name] as string[];
      setValue(name, (list.includes(option) ? list.filter((o) => o !== option) : [...list, option]) as V[typeof name]);
      touch(name);
    },
  };
}

/** Moves focus to the first invalid control after a failed submit, so keyboard and screen reader users land on it. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    const el = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = el instanceof HTMLFieldSetElement ? el.querySelector<HTMLElement>("input, select, textarea") : el;
    target?.focus();
  });
}

/** Input plus a show/hide toggle. Accepts the id and aria wiring that FormField injects. */
export function PasswordInput(props: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <Input {...props} type={visible ? "text" : "password"} spellCheck={false} autoCapitalize="none" />
      <Button
        variant="secondary"
        className="shrink-0 px-4"
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </Button>
    </div>
  );
}

type ChoiceGroupProps = {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Checkbox group when `selected` is an array, radio group when it is a string. */
  selected: string[] | string;
  onPick: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
};

/** Checkbox or radio options as a compact wrapping row of bordered choices. Native inputs, visible focus. */
export function ChoiceGroup({ legend, name, options, selected, onPick, error, hint, required }: ChoiceGroupProps) {
  const id = useId();
  const multi = Array.isArray(selected);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="m-0 border-0 p-0" aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="p-0 text-sm font-semibold">
        {legend}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[var(--warning)]">
            *
          </span>
        ) : null}
      </legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-[var(--ink-soft)]">
          {hint}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = multi ? selected.includes(o.value) : selected === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                "inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border bg-white px-3.5 text-[0.9375rem] " +
                  "hover:border-[var(--forest)] has-[:checked]:border-[var(--forest)] has-[:checked]:bg-[var(--mist)] has-[:checked]:font-semibold",
                error ? "border-[var(--warning)]" : "border-[var(--line)]",
              )}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onPick(o.value)}
                className="size-[1.125rem] accent-[var(--forest)]"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A titled group of fields inside a long form, separated by a hairline rule rather than a box. */
export function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6 border-t border-[var(--line)] pt-6">
      <h3 id={id} className="font-[family-name:var(--font-body)] text-[1.0625rem] font-bold tracking-normal">
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-[0.2em] size-[1.125rem] shrink-0" fill="none">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="1" fill="currentColor" />
    </svg>
  );
}

type SubmitRowProps = {
  label: string;
  pending?: boolean;
  /**
   * Set when this action has no backend yet: the button stays disabled and this sentence says why,
   * so nobody believes something was sent.
   */
  notConnected?: string;
  children?: ReactNode;
};

/** Submit button with its own note. A form whose action has no backend passes `notConnected`. */
export function SubmitRow({ label, pending = false, notConnected, children }: SubmitRowProps) {
  const noteId = useId();
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--line)] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Button
          type="submit"
          disabled={Boolean(notConnected)}
          loading={pending}
          aria-describedby={notConnected ? noteId : undefined}
          className="w-full sm:w-auto"
        >
          {label}
        </Button>
        {children}
      </div>
      {notConnected ? (
        <p id={noteId} className="flex gap-2.5 text-[0.9375rem] leading-normal text-[var(--ink-soft)]">
          <InfoIcon />
          <span>{notConnected}</span>
        </p>
      ) : null}
    </div>
  );
}
