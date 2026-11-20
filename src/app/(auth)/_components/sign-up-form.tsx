"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { PASSWORD_HINT, signUpSchema } from "@/lib/validation/auth";
import { PasswordInput, SubmitRow, focusFirstInvalid, useZodForm } from "./form-kit";

/**
 * Account creation through POST /api/auth/signup (email and password only). The server answers the same way
 * whether or not the email already has an account, so this page never says which it was.
 */
export function SignUpForm() {
  const form = useZodForm(signUpSchema, { email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    form.touchAll();
    const parsed = signUpSchema.safeParse(form.values);
    if (!parsed.success) {
      focusFirstInvalid(ref.current);
      return;
    }
    setError(null);
    start(async () => {
      try {
        await api("/api/auth/signup", { method: "POST", body: parsed.data });
        setDone(true);
        requestAnimationFrame(() => doneRef.current?.focus());
      } catch (failure) {
        setError(errorMessage(failure));
      }
    });
  };

  if (done) {
    return (
      <section role="status" aria-labelledby="signup-done" className="rounded-md border border-[var(--forest)] bg-[var(--mist)] p-6">
        <h2 id="signup-done" ref={doneRef} tabIndex={-1} className="font-sans text-[1.375rem] font-bold tracking-normal outline-none">
          Check your email
        </h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          If this address can be used, a message to confirm it is on its way. After you confirm, sign in with your email and
          password.
        </p>
        <p className="mt-4">
          <Link href="/sign-in" className="font-semibold">
            Go to sign in
          </Link>
        </p>
      </section>
    );
  }

  return (
    <form ref={ref} noValidate onSubmit={onSubmit} aria-label="Create an account" className="flex flex-col gap-7">
      <FormField label="Email address" error={form.errorFor("email")} required>
        <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...form.bind("email")} />
      </FormField>
      <FormField label="Password" hint={PASSWORD_HINT} error={form.errorFor("password")} required>
        <PasswordInput autoComplete="new-password" {...form.bind("password")} />
      </FormField>
      {error ? (
        <p role="alert" className="rounded-md border border-[var(--warning)] bg-[var(--warning-surface)] p-4 text-[0.9375rem]">
          {error}
        </p>
      ) : null}
      <SubmitRow label="Create account" pending={pending} />
    </form>
  );
}
