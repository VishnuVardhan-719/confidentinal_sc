"use client";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LANGUAGES } from "./schemas";
import { NotConnected } from "./stepper";
import { SectionTitle } from "./page-parts";

/**
 * Account settings, UI only. There is no signed-in user yet, so fields start empty, nothing is
 * prefilled, and saving is disabled. The language choice does not switch the UI until i18n lands.
 */
export function AccountForm() {
  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="max-w-[40rem]">
      <section aria-labelledby="account-language" className="border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-language">Language</SectionTitle>
        <div className="mt-5">
          <FormField
            label="Language for SureCure Visit"
            hint="Telugu and Hindi are not available yet. The site is shown in English for now."
          >
            <div className="max-w-[20rem]">
              <Select name="language" defaultValue="en">
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} lang={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
          </FormField>
        </div>
      </section>

      <section aria-labelledby="account-profile" className="mt-12 border-t border-[var(--ink)] pt-6">
        <SectionTitle id="account-profile">Profile</SectionTitle>
        <div className="mt-5 grid gap-6">
          <FormField label="Full name">
            <Input name="name" autoComplete="name" />
          </FormField>
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField label="Mobile number" hint="10 digits, for example 98765 43210.">
              <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" className="tabular-nums" />
            </FormField>
            <FormField label="Email">
              <Input name="email" type="email" autoComplete="email" spellCheck={false} />
            </FormField>
          </div>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-6">
        <NotConnected id="account-not-connected">Saving is not connected yet. Nothing you change here is stored.</NotConnected>
        <Button
          type="submit"
          aria-disabled="true"
          aria-describedby="account-not-connected"
          onClick={(e) => e.preventDefault()}
          className="cursor-not-allowed opacity-55"
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}
