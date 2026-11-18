"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signInSchema } from "@/lib/validation/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo/accounts";
import { signInWithDemoPassword } from "@/lib/demo/auth-actions";
import { PasswordInput, SubmitRow, useZodForm } from "./form-kit";

type Method = "phone" | "email";

const methods: ReadonlyArray<{ value: Method; label: string }> = [
  { value: "phone", label: "Mobile number" },
  { value: "email", label: "Email and password" },
];

const demoOn = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function SignInForm() {
  const form = useZodForm(signInSchema, { method: "phone", phone: "", email: "", password: "" });
  const method = form.values.method as Method;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Real auth is not connected. In demo mode the email path checks the public demo accounts list;
  // otherwise nothing is sent.
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!demoOn || method !== "email") return;
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next") ?? undefined;
    start(async () => {
      const r = await signInWithDemoPassword(String(form.values.email ?? ""), String(form.values.password ?? ""), next);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Sign in" className="flex flex-col gap-7">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2.5 p-0 text-sm font-semibold">Sign in with</legend>
        <div className="grid grid-cols-2 rounded-md border border-[var(--forest)] p-1">
          {methods.map((m) => (
            <label
              key={m.value}
              className={
                "flex min-h-11 cursor-pointer items-center justify-center rounded-[calc(var(--radius)-2px)] px-3 text-center text-[0.9375rem] font-semibold leading-tight text-[var(--forest)] " +
                "has-[:checked]:bg-[var(--forest)] has-[:checked]:text-[var(--paper)] hover:bg-[var(--mist)] has-[:checked]:hover:bg-[var(--forest)] " +
                "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
              }
            >
              <input
                type="radio"
                name="method"
                value={m.value}
                checked={method === m.value}
                onChange={() => form.setValue("method", m.value)}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "phone" ? (
        <FormField
          label="Mobile number"
          hint="10-digit Indian mobile number. Signing in this way uses a 6-digit code sent to this number."
          error={form.errorFor("phone")}
          required
        >
          <Input type="tel" inputMode="tel" autoComplete="tel" {...form.bind("phone")} />
        </FormField>
      ) : (
        <>
          <FormField label="Email address" error={form.errorFor("email")} required>
            <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...form.bind("email")} />
          </FormField>
          <div className="flex flex-col gap-2">
            <FormField label="Password" error={form.errorFor("password")} required>
              <PasswordInput autoComplete="current-password" {...form.bind("password")} />
            </FormField>
            <Link href="/forgot-password" className="text-link self-start text-[0.9375rem]">
              Forgot your password?
            </Link>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="text-[0.9375rem] text-[var(--warning)]">{error}</p>
      ) : null}
      {demoOn && method === "email" ? (
        <details className="rounded-md border border-[var(--line)] p-4 text-[0.9375rem]">
          <summary className="cursor-pointer font-semibold">Test logins (demo only, not real accounts)</summary>
          <p className="mt-2">Password for all: <code>{DEMO_PASSWORD}</code></p>
          <ul className="mt-2 grid gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}><code>{a.email}</code> — {a.role}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <SubmitRow label={method === "phone" ? "Send code" : "Sign in"} action="Sign-in" complete={form.complete} demo={demoOn && method === "email"} pending={pending}>
        {method === "phone" ? (
          <Link href="/verify" className="text-link text-[0.9375rem]">
            I already have a code
          </Link>
        ) : null}
      </SubmitRow>
    </form>
  );
}
