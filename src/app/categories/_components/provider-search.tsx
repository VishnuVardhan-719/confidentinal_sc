"use client";

import { useState, type FormEvent } from "react";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { errorMessage } from "@/lib/client/api";
import { PIN_RE, SLUG_TO_CATEGORY, bookHref, type CatalogRow, type CategorySlug } from "@/lib/client/booking";
import { UNIT_LABEL, formatPaise } from "@/lib/client/format";
import { useCatalogSearch } from "@/lib/client/use-catalog";

/**
 * Public provider search for one category, from GET /api/catalog. The list is exactly what the server
 * returns for the PIN code: providers whose details were checked and who cover that PIN. Nothing is added,
 * ranked or invented here, and no rating, review or arrival time is shown.
 */
export function ProviderSearch({ slug, noun }: { slug: CategorySlug; noun: string }) {
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const results = useCatalogSearch(pin ? SLUG_TO_CATEGORY[slug] : null, pin);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!PIN_RE.test(value)) {
      setError("Enter a 6-digit PIN code, for example 500001.");
      event.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    setError(undefined);
    if (value === pin) results.retry();
    setPin(value);
  }

  return (
    <div className="grid max-w-[46rem] gap-8">
      <form noValidate onSubmit={search} role="search" aria-label={`Find ${noun}s`} className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[14rem]">
          <FormField label="Your PIN code" required error={error}>
            <Input
              name="pin"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <Button type="submit" loading={results.status === "loading"}>
          Find {noun}s
        </Button>
      </form>

      <div>
        {results.status === "idle" ? (
          <p className="text-[var(--ink-soft)]">Enter your PIN code to see {noun}s who cover your area.</p>
        ) : results.status === "loading" ? (
          <Loading label={`Finding ${noun}s for ${pin}`} />
        ) : results.status === "error" ? (
          <ErrorState headingLevel="h3" title={`${capital(noun)}s could not be loaded`} message={errorMessage(results.error)} onRetry={results.retry} />
        ) : results.rows.length === 0 ? (
          <EmptyState
            headingLevel="h3"
            title={`No ${noun}s cover PIN code ${pin} yet`}
            message="Only providers whose details have been checked and who serve your PIN code are listed. Try a nearby PIN code."
          />
        ) : (
          <>
            <p role="status" className="mb-4 text-[0.9375rem] text-[var(--ink-soft)]">
              {results.rows.length} {results.rows.length === 1 ? "service" : "services"} for PIN code {pin}.
            </p>
            <ul className="m-0 grid list-none gap-4 p-0">
              {results.rows.map((row) => (
                <ResultCard key={`${row.provider_reference}-${row.service_id}`} row={row} slug={slug} pin={pin!} />
              ))}
            </ul>
            {results.next ? (
              <div className="mt-6">
                <Button variant="secondary" onClick={results.loadMore} loading={results.more === "loading"}>
                  Show more
                </Button>
                {results.more === "error" ? (
                  <p role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
                    {errorMessage(results.moreError)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function capital(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ResultCard({ row, slug, pin }: { row: CatalogRow; slug: CategorySlug; pin: string }) {
  const profile = row.public_profile ?? {};
  const facts = [profile.specialty, profile.qualification, profile.accreditation_label].filter(Boolean);
  return (
    <li className="grid gap-3 rounded-md border border-[var(--line)] bg-white p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3 className="font-sans text-[1.125rem] leading-snug font-bold tracking-normal break-words">{row.display_name}</h3>
        <p className="mt-1 font-semibold break-words">{row.service_title}</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
          {formatPaise(row.amount_paise)} {UNIT_LABEL[row.unit] ?? ""} · about {row.duration_minutes} minutes · {row.city}
        </p>
        {facts.length ? <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">{facts.join(" · ")}</p> : null}
        {profile.languages?.length ? (
          <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">Languages: {profile.languages.join(", ")}</p>
        ) : null}
      </div>
      <ButtonLink
        href={bookHref(slug, pin, row)}
        className="w-full sm:w-auto"
        aria-label={`Request ${row.service_title} from ${row.display_name}`}
      >
        Request
      </ButtonLink>
    </li>
  );
}
