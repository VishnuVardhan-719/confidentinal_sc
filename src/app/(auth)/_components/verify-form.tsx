"use client";

import type { FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { verifyOtpSchema } from "@/lib/validation/auth";
import { SubmitRow, useZodForm } from "./form-kit";

const holdSubmit = (e: FormEvent) => e.preventDefault();

/** Keep digits only, so pasted codes like "123 456" or "123-456" still fit. */
export const toOtpDigits = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

/*
 * One input, not six boxes: it works with SMS autofill (one-time-code), paste and screen readers.
 * No motion anywhere in this form, per the OTP policy in docs/specs/DESIGN_ANIMATION_I18N.md.
 */
export function VerifyForm() {
  const form = useZodForm(verifyOtpSchema, { code: "" });
  return (
    <form noValidate onSubmit={holdSubmit} aria-label="Enter your code" className="flex flex-col gap-7">
      <FormField label="6-digit code" hint="Digits only. You can paste the whole code." error={form.errorFor("code")} required>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          enterKeyHint="done"
          spellCheck={false}
          className="max-w-[13rem] text-center font-semibold text-[1.75rem] tabular-nums tracking-[0.4em] indent-[0.4em] transition-none!"
          {...form.bind("code", toOtpDigits)}
        />
      </FormField>
      <SubmitRow label="Verify code" action="Code verification" complete={form.complete} />
    </form>
  );
}
