"use client";

import { useId, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { fieldErrors } from "@/components/ui/form-field";
import { Input, type InputProps } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";
import { AUTH_CONNECTED } from "../_lib/connection";

/*
 * Local form state validated by a Zod schema. Errors appear after a field is first left (blur) and then
 * update as the person types, so nobody is scolded before they finish a field.
 */
export function useZodForm<K extends string>(schema: ZodType, initial: Record<K, string>) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});

  const parsed = schema.safeParse(values);
  const all = parsed.success ? {} : fieldErrors(parsed.error);

  const setValue = (name: K, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const touch = (name: K) => setTouched((t) => (t[name] ? t : { ...t, [name]: true }));

  return {
    values,
    setValue,
    touch,
    complete: parsed.success,
    errorFor: (name: K): string | undefined => (touched[name] ? all[name] : undefined),
    bind: (name: K, format?: (raw: string) => string) => ({
      name,
      value: values[name],
      onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(name, format ? format(e.target.value) : e.target.value),
      onBlur: () => touch(name),
    }),
  };
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
  /** Sentence-start name of the action, e.g. "Sign-in". */
  action: string;
  /** True when every field passes validation. */
  complete: boolean;
  children?: ReactNode;
};

/**
 * Submit button that stays disabled while auth is not connected, with the reason written next to it
 * and a polite live region that speaks once the details are complete.
 */
export function SubmitRow({ label, action, complete, children }: SubmitRowProps) {
  const noteId = useId();
  const disabled = !AUTH_CONNECTED;
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--line)] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Button type="submit" disabled={disabled} aria-describedby={disabled ? noteId : undefined} className="w-full sm:w-auto">
          {label}
        </Button>
        {children}
      </div>
      {disabled ? (
        <p id={noteId} className="flex gap-2.5 text-[0.9375rem] leading-normal text-[var(--ink-soft)]">
          <InfoIcon />
          <span>
            <strong className="font-semibold text-[var(--ink)]">{action} is not connected yet.</strong> You can fill in
            this form to check your details, but nothing is sent or stored.
          </span>
        </p>
      ) : null}
      <p role="status" aria-live="polite" className={cx("text-[0.9375rem] font-semibold text-[var(--forest)]", !complete && "sr-only")}>
        {complete && disabled ? `Your details look complete. ${action} is not connected yet, so nothing was sent.` : ""}
      </p>
    </div>
  );
}
