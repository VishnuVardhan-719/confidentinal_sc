"use client";

import type { FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { SubmitRow, useZodForm } from "./form-kit";

const holdSubmit = (e: FormEvent) => e.preventDefault();

export function ForgotPasswordForm() {
  const form = useZodForm(forgotPasswordSchema, { email: "" });
  return (
    <form noValidate onSubmit={holdSubmit} aria-label="Reset your password" className="flex flex-col gap-7">
      <FormField
        label="Email address"
        hint="Use the address you signed up with."
        error={form.errorFor("email")}
        required
      >
        <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...form.bind("email")} />
      </FormField>
      <SubmitRow
        label="Send reset link"
        notConnected="Password reset is not available online yet, so nothing is sent from this form. Contact support to reset your password."
      />
    </form>
  );
}
