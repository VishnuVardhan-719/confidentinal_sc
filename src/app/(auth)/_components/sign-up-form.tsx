"use client";

import { useId } from "react";
import type { FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PASSWORD_HINT, signUpSchema, type SignupRole } from "@/lib/validation/auth";
import { PasswordInput, SubmitRow, useZodForm } from "./form-kit";

/** Order and wording for the role choice. Admin is deliberately absent: staff accounts are invite-only. */
export const roleOptions: ReadonlyArray<{ value: SignupRole; label: string; detail: string }> = [
  {
    value: "patient",
    label: "Patient or family member",
    detail: "Request doctor visits, lab services, scheduled ambulance transport or caretaker support.",
  },
  { value: "doctor", label: "Doctor", detail: "Offer planned consultations. You set your fees and accept requests yourself." },
  { value: "lab", label: "Lab", detail: "Offer diagnostic tests. You set your prices and choose which requests to accept." },
  {
    value: "ambulance",
    label: "Scheduled ambulance operator",
    detail: "Offer planned, non-emergency patient transport.",
  },
  { value: "caretaker", label: "Caretaker", detail: "Offer non-clinical help with day-to-day care at home." },
];

const holdSubmit = (e: FormEvent) => e.preventDefault();

export function SignUpForm() {
  const form = useZodForm(signUpSchema, { role: "", fullName: "", phone: "", email: "", password: "" });
  const roleError = form.errorFor("role");
  const roleErrorId = useId();
  const roleHintId = useId();
  const isProvider = form.values.role !== "" && form.values.role !== "patient";

  return (
    <form noValidate onSubmit={holdSubmit} aria-label="Create an account" className="flex flex-col gap-7">
      <fieldset
        className="m-0 border-0 p-0"
        aria-describedby={[roleHintId, roleError ? roleErrorId : ""].filter(Boolean).join(" ")}
        aria-invalid={roleError ? true : undefined}
        aria-required="true"
      >
        <legend className="p-0 text-sm font-semibold">
          I am joining as
          <span aria-hidden="true" className="ml-1 text-[var(--warning)]">
            *
          </span>
        </legend>
        <p id={roleHintId} className="mt-1.5 text-sm text-[var(--ink-soft)]">
          Admin accounts cannot be chosen here.
        </p>
        <div className="mt-3 border-t border-[var(--ink)]">
          {roleOptions.map((r) => (
            <label
              key={r.value}
              className={
                "grid cursor-pointer grid-cols-[1.25rem_1fr] gap-x-3.5 gap-y-0.5 border-b border-[var(--line)] px-2 py-3.5 " +
                "hover:bg-[var(--mist)] has-[:checked]:bg-[var(--mist)]"
              }
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={form.values.role === r.value}
                onChange={() => {
                  form.setValue("role", r.value);
                  form.touch("role");
                }}
                className="row-span-2 mt-[0.2em] size-5 accent-[var(--forest)]"
              />
              <span className="font-semibold leading-snug">{r.label}</span>
              <span className="text-[0.9375rem] leading-normal text-[var(--ink-soft)]">{r.detail}</span>
            </label>
          ))}
        </div>
        {roleError ? (
          <p id={roleErrorId} role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
            {roleError}
          </p>
        ) : null}
        {isProvider ? (
          <p className="mt-3 text-[0.9375rem] text-[var(--ink-soft)]">
            After sign-up you will add your registration details for review. Nobody can book you until that review is
            complete.
          </p>
        ) : null}
      </fieldset>

      <FormField label="Full name" error={form.errorFor("fullName")} required>
        <Input autoComplete="name" autoCapitalize="words" {...form.bind("fullName")} />
      </FormField>

      <FormField label="Mobile number" hint="10-digit Indian mobile number." error={form.errorFor("phone")} required>
        <Input type="tel" inputMode="tel" autoComplete="tel" {...form.bind("phone")} />
      </FormField>

      <FormField label="Email address" error={form.errorFor("email")} required>
        <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...form.bind("email")} />
      </FormField>

      <FormField label="Password" hint={PASSWORD_HINT} error={form.errorFor("password")} required>
        <PasswordInput autoComplete="new-password" {...form.bind("password")} />
      </FormField>

      <SubmitRow label="Create account" action="Account creation" complete={form.complete} />
    </form>
  );
}
