"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { destinationFor } from "@/components/app/access";
import { signIn } from "@/lib/client/account";
import { errorMessage } from "@/lib/client/api";
import { signInSchema } from "@/lib/validation/auth";
import { PasswordInput, SubmitRow, focusFirstInvalid, useZodForm } from "./form-kit";

/** Email and password sign-in through POST /api/auth/login. Afterwards goes to `?next=` when the account may open it. */
export function SignInForm() {
  const form = useZodForm(signInSchema, { email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    form.touchAll();
    const parsed = signInSchema.safeParse(form.values);
    if (!parsed.success) {
      focusFirstInvalid(ref.current);
      return;
    }
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next");
    start(async () => {
      try {
        const account = await signIn(parsed.data.email, parsed.data.password);
        router.replace(destinationFor(account.roles, next));
      } catch (failure) {
        setError(errorMessage(failure));
      }
    });
  };

  return (
    <form ref={ref} noValidate onSubmit={onSubmit} aria-label="Sign in" className="flex flex-col gap-7">
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

      {error ? (
        <p role="alert" className="rounded-md border border-[var(--warning)] bg-[var(--warning-surface)] p-4 text-[0.9375rem]">
          {error}
        </p>
      ) : null}
      <SubmitRow label="Sign in" pending={pending} />
    </form>
  );
}
