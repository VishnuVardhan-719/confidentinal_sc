"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatInr } from "@/lib/demo/data";
import { DemoBadge } from "./demo-badge";
import { ANY, filterCards, filterOptions, type Filters, type ProviderCard } from "./demo-providers";

const selectClass =
  "min-h-11 w-full appearance-none rounded-md border border-[var(--line)] bg-white bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10 pl-3.5 text-base text-[var(--ink)] " +
  "hover:border-[var(--forest)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

// Chevron drawn as an inline SVG data URI in the forest colour.
const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f5f59' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

function FilterSelect({
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  anyLabel: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--ink)]">
        {label}
      </label>
      <select
        id={id}
        className={selectClass}
        style={{ backgroundImage: chevron }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={ANY}>{anyLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Browsable list of demo providers with city and language filters. Local state only, no network.
 * Results are announced through a polite status line.
 */
export function ProviderBrowser({ cards, noun }: { cards: ProviderCard[]; noun: string }) {
  const [filters, setFilters] = useState<Filters>({ city: ANY, language: ANY });
  const options = useMemo(() => filterOptions(cards), [cards]);
  const shown = useMemo(() => filterCards(cards, filters), [cards, filters]);
  const filtered = filters.city !== ANY || filters.language !== ANY;
  const clear = () => setFilters({ city: ANY, language: ANY });

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="group" aria-label="Filter demo providers">
        <FilterSelect
          label="City"
          value={filters.city}
          anyLabel="All cities"
          options={options.cities}
          onChange={(city) => setFilters((f) => ({ ...f, city }))}
        />
        <FilterSelect
          label="Language"
          value={filters.language}
          anyLabel="Any language"
          options={options.languages}
          onChange={(language) => setFilters((f) => ({ ...f, language }))}
        />
        <Button variant="quiet" onClick={clear} disabled={!filtered} className="justify-self-start">
          Clear filters
        </Button>
      </div>

      <p role="status" aria-live="polite" className="mt-6 text-[0.9375rem] text-[var(--ink-soft)]">
        Showing {shown.length} of {cards.length} demo {cards.length === 1 ? noun : `${noun}s`}
        {filters.city !== ANY ? ` in ${filters.city}` : ""}
        {filters.language !== ANY ? ` who speak ${filters.language}` : ""}.
      </p>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No demo providers match"
            message="Try another city or language, or clear the filters."
            action={
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 grid border-t border-[var(--ink)] md:grid-cols-2 md:gap-x-12">
          {shown.map((c) => (
            <li
              key={c.id}
              className="group relative grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-b border-[var(--line)] px-1 py-6 transition-colors duration-300 hover:bg-[var(--mist)] has-[a:focus-visible]:outline-[3px] has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)] motion-reduce:transition-none md:px-3"
            >
              <h3 className="col-start-1 text-[clamp(1.375rem,2.2vw,1.75rem)]">
                <Link
                  href={`/providers/${c.id}`}
                  className="text-[var(--ink)] no-underline group-hover:underline after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {c.name}
                </Link>
              </h3>
              <p className="col-start-1 text-[var(--ink)]">
                {c.speciality} <span aria-hidden="true">·</span> <span className="sr-only">, </span>
                {c.city}
              </p>
              <p className="col-start-1 text-[0.9375rem] text-[var(--ink-soft)]">Speaks {c.languages.join(", ")}</p>
              <div className="col-start-2 row-span-3 row-start-1 flex flex-col items-end justify-between gap-3 text-right">
                <p className="text-[0.9375rem] text-[var(--ink-soft)]">
                  {c.fromPaise !== null ? (
                    <>
                      from <span className="text-lg font-semibold text-[var(--ink)] tabular-nums">{formatInr(c.fromPaise)}</span>
                    </>
                  ) : (
                    "Price not listed"
                  )}
                </p>
                <DemoBadge />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
