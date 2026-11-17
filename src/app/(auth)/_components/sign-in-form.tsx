"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signInSchema } from "@/lib/validation/auth";
import { PasswordInput, SubmitRow, useZodForm } from "./form-kit";

type Method = "phone" | "email";

const methods: ReadonlyArray<{ value: Method; label: string }> = [
  { value: "phone", label: "Mobile number" },
  { value: "email", label: "Email and password" },
];

// Nothing is sent while auth is not connected. I01 replaces this with a server action.
const holdSubmit = (e: FormEvent) => e.preventDefault();

export function SignInForm() {
  const form = useZodForm(signInSchema, { method: "phone", phone: "", email: "", password: "" });
  const method = form.values.method as Method;

  return (
    <form noValidate onSubmit={holdSubmit} aria-label="Sign in" className="flex flex-col gap-7">
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

      <SubmitRow label={method === "phone" ? "Send code" : "Sign in"} action="Sign-in" complete={form.complete}>
        {method === "phone" ? (
          <Link href="/verify" className="text-link text-[0.9375rem]">
            I already have a code
          </Link>
        ) : null}
      </SubmitRow>
    </form>
  );
}
