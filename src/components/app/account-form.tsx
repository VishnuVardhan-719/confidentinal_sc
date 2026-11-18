"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DemoBadge } from "./demo-parts";
import { dispatchDemo, useDemoState } from "./demo-store";
import { Icon } from "./icons";
import { SectionTitle } from "./page-parts";
import { LANGUAGES, accountSchema } from "./schemas";
import { focusFirstError } from "./use-flow";
import { stepErrors } from "./steps";

type Field = "name" | "phone" | "email" | "language";

/**
 * Account settings for the signed-in demo user. Saving validates with Zod and keeps the values in this tab's
 * demo state only. The language choice is stored but does not switch the UI (the locale switcher is a separate task).
 */
export function AccountForm({ role, name, email }: { role: string; name: string; email: string }) {
  const demo = useDemoState();
  const saved = demo.profiles[role];
  const DEFAULTS: Record<Field, string> = { name, phone: "", email, language: "en" };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  // Typed values win; otherwise show what this tab saved, then the demo user's details.
  // Derived this way so the saved profile can arrive from storage after hydration without remounting.
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const value = (field: Field) => draft[field] ?? saved?.[field] ?? DEFAULTS[field];
  const bind = (field: Field) => ({
    name: field,
    value: value(field),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [field]: e.target.value })),
  });

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const found = stepErrors(accountSchema, data);
    setErrors(found);
    if (Object.keys(found).length) {
      setStatus("");
      focusFirstError(form, found);
      return;
    }
    const parsed = accountSchema.parse(data);
    dispatchDemo({ type: "saveProfile", role, profile: parsed });
    setStatus("Saved for this demo tab. Nothing was sent anywhere.");
  }

  return (
    <form noValidate onSubmit={save} className="max-w-[40rem]">
      <DemoBadge className="mb-8" />
      <section aria-labelledby="account-language" className="border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-language">Language</SectionTitle>
        <div className="mt-5 max-w-[20rem]">
          <FormField
            label="Language for SureCure Visit"
            hint="Telugu and Hindi are not available yet. The site is shown in English for now."
          >
            <Select {...bind("language")}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </section>

      <section aria-labelledby="account-profile" className="mt-12 border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-profile">Profile</SectionTitle>
        <div className="mt-5 grid gap-6">
          <FormField label="Full name" required error={errors.name}>
            <Input {...bind("name")} autoComplete="name" />
          </FormField>
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField label="Mobile number" required hint="10 digits, for example 98765 43210." error={errors.phone}>
              <Input
                {...bind("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                className="tabular-nums"
              />
            </FormField>
            <FormField label="Email" required error={errors.email}>
              <Input {...bind("email")} type="email" autoComplete="email" spellCheck={false} />
            </FormField>
          </div>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-6">
        <p role="status" className="flex items-center gap-2 text-[0.9375rem] text-[var(--forest)]">
          {status ? (
            <>
              <Icon name="check" className="size-4" />
              {status}
            </>
          ) : null}
        </p>
        <Button type="submit">Save changes</Button>
      </div>
    </form>
  );
}
