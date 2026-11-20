"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { loadAccount } from "@/lib/client/account";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { Icon } from "./icons";
import { ROLE_LABEL } from "./nav-model";
import { SectionTitle } from "./page-parts";
import { LANGUAGES, accountSchema } from "./schemas";
import { useSignedIn } from "./session-gate";
import { stepErrors } from "./steps";
import { focusFirstError } from "./use-flow";

type Field = "name" | "language";

/**
 * Display name and language for the signed-in account: PATCH /api/auth/profile with the profile version
 * from GET /api/auth/me, so an edit made elsewhere is never overwritten silently.
 */
export function AccountForm() {
  const account = useSignedIn();
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const value = (field: Field) => draft[field] ?? (field === "name" ? account.name : account.locale);
  const bind = (field: Field) => ({
    name: field,
    value: value(field),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setStatus("");
      setDraft((d) => ({ ...d, [field]: e.target.value }));
    },
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = { name: value("name"), language: value("language") };
    const found = stepErrors(accountSchema, data);
    setErrors(found);
    setFailure(null);
    setStatus("");
    if (Object.keys(found).length) {
      focusFirstError(form, found);
      return;
    }
    const parsed = accountSchema.parse(data);
    setPending(true);
    try {
      await api("/api/auth/profile", {
        method: "PATCH",
        auth: true,
        body: { displayName: parsed.name, locale: parsed.language, expectedVersion: account.version },
      });
      await loadAccount(true);
      setDraft({});
      setStatus("Your changes are saved.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await loadAccount(true);
        setDraft({});
        setFailure("Your profile was changed somewhere else, so we loaded the latest version. Check it and save again.");
      } else {
        setFailure(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="max-w-[40rem]">
      <section aria-labelledby="account-profile" className="border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-profile">Profile</SectionTitle>
        <p className="mt-2 text-[0.9375rem] text-[var(--ink-soft)]">
          Account type: {account.roles.map((r) => ROLE_LABEL[r]).join(", ") || "None yet"}
        </p>
        <div className="mt-5 grid gap-6">
          <FormField label="Name" required hint="Shown to providers you send requests to." error={errors.name}>
            <Input {...bind("name")} autoComplete="name" />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="account-language" className="mt-12 border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-language">Language</SectionTitle>
        <div className="mt-5 max-w-[20rem]">
          <FormField label="Language for SureCure Visit" hint="Saved with your account. Most pages are in English for now.">
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

      {failure ? (
        <p role="alert" className="mt-8 rounded-md border border-[var(--warning)] bg-[var(--warning-surface)] p-4 text-[0.9375rem]">
          {failure}
        </p>
      ) : null}
      <div className="mt-10 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-6">
        <p role="status" className="flex items-center gap-2 text-[0.9375rem] text-[var(--forest)]">
          {status ? (
            <>
              <Icon name="check" className="size-4" />
              {status}
            </>
          ) : null}
        </p>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
