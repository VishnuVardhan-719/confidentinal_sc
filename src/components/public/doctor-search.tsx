"use client";

import { MapPin } from "lucide-react";
import { useLocale } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { SearchCombobox, type SearchComboboxLabels } from "@/components/shared/search-combobox";
import { useRouter } from "@/i18n/navigation";
import { doctorSearchHref } from "./finder";
import { suggestDoctorSearch } from "./search-suggest";

export type DoctorSearchLabels = {
  query: SearchComboboxLabels;
  location: string;
  locationHint: string;
  locationPlaceholder: string;
  submit: string;
  submitting: string;
};

/**
 * Landing hero doctor search: location (city or PIN) + query with grouped suggestions.
 * Without JS it is a GET form to /{locale}/find?search=doctors, which redirects to the results page.
 * No geolocation here; the shared LocationPicker (fe-c2) handles precise location with consent.
 */
export function DoctorSearch({ labels, className }: { labels: DoctorSearchLabels; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [location, setLocation] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    startTransition(() => router.push(doctorSearchHref({ q: typeof q === "string" ? q : "", location })));
  }

  return (
    <form
      role="search"
      action={`/${locale}/find`}
      method="get"
      onSubmit={onSubmit}
      className={cn("grid gap-4 rounded-lg bg-surface p-4 shadow-raised sm:p-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto] md:items-end", className)}
    >
      <input type="hidden" name="search" value="doctors" />
      <div className="grid gap-2">
        <label htmlFor={`${id}-loc`} className="text-base font-semibold text-ink">
          {labels.location}
        </label>
        <p id={`${id}-loc-hint`} className="-mt-1 text-sm text-muted">
          {labels.locationHint}
        </p>
        <div className="relative">
          <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-forest" />
          <input
            id={`${id}-loc`}
            name="location"
            type="text"
            autoComplete="address-level2"
            aria-describedby={`${id}-loc-hint`}
            placeholder={labels.locationPlaceholder}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={cn(fieldControlClass, "pl-11")}
          />
        </div>
      </div>
      <SearchCombobox
        labels={labels.query}
        loadSuggestions={(q) => suggestDoctorSearch(q, locale)}
      />
      <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className="w-full md:w-auto">
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
