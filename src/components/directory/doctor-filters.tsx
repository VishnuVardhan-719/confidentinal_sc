"use client";

import { SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatPaise, type Locale } from "@/lib/format";
import { AVAILABILITY, CONSULT_MODES, GENDERS, LANGUAGES, SPECIALITIES, type DoctorSearch, type DoctorSearchInput } from "@/modules/providers/doctor-search";

export const FEE_STEPS = [50000, 80000, 100000, 150000] as const;
export const EXPERIENCE_STEPS = [5, 10, 15, 20] as const;
type Draft = Pick<DoctorSearch, "speciality" | "language" | "gender" | "mode" | "feeMax" | "availability" | "experienceMin" | "showFull">;
const FILTER_KEYS = ["speciality", "language", "gender", "mode", "feeMax", "availability", "experienceMin", "showFull"] as const;
const EMPTY_DRAFT: Draft = { showFull: false };

export function draftFrom(search: DoctorSearch): Draft {
  return { speciality: search.speciality, language: search.language, gender: search.gender, mode: search.mode, feeMax: search.feeMax,
    availability: search.availability, experienceMin: search.experienceMin, showFull: search.showFull };
}
export function activeFilterCount(search: DoctorSearch): number {
  return FILTER_KEYS.filter(key => key === "showFull" ? search.showFull : search[key] !== undefined).length;
}
/** Applying filters keeps the query, place and sort, and always returns to page 1. */
export function applyDraft(search: DoctorSearch, draft: Draft | null): DoctorSearchInput {
  return { q: search.q, city: search.city, pin: search.pin, sort: search.sort, symptom: draft?.speciality ? undefined : search.symptom, ...(draft ?? {}), page: 1 };
}

function FilterFields({ draft, setDraft, idPrefix }: { draft: Draft; setDraft: (next: Draft) => void; idPrefix: string }) {
  const t = useTranslations("booking.filters");
  const ts = useTranslations("booking.search");
  const locale = useLocale() as Locale;
  const select = <K extends keyof Draft>(key: K, label: string, options: readonly { value: string; label: string }[], hint?: string) => (
    <div className="grid gap-2">
      <label htmlFor={`${idPrefix}-${key}`} className="text-base font-semibold text-ink">{label}</label>
      {hint ? <p id={`${idPrefix}-${key}-hint`} className="-mt-1 text-sm text-muted">{hint}</p> : null}
      <select id={`${idPrefix}-${key}`} name={key} className={fieldControlClass} aria-describedby={hint ? `${idPrefix}-${key}-hint` : undefined}
        value={draft[key] === undefined ? "" : String(draft[key])}
        onChange={event => {
          const raw = event.target.value;
          const value = raw === "" ? undefined : key === "feeMax" || key === "experienceMin" ? Number(raw) : raw;
          setDraft({ ...draft, [key]: value });
        }}>
        <option value="">{t("any")}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
  return (
    <div className="grid gap-5">
      {select("speciality", t("speciality"), SPECIALITIES.map(value => ({ value, label: ts(`specialities.${value}`) })))}
      {select("availability", t("availability"), AVAILABILITY.map(value => ({ value, label: t(`availabilityOptions.${value}`) })))}
      {select("mode", t("mode"), CONSULT_MODES.map(value => ({ value, label: t(`modes.${value}`) })), t("modeHint"))}
      {select("feeMax", t("feeMax"), FEE_STEPS.map(value => ({ value: String(value), label: t("feeUpTo", { amount: formatPaise(value, locale) }) })))}
      {select("language", t("language"), LANGUAGES.map(value => ({ value, label: t(`languages.${value}`) })))}
      {select("gender", t("gender"), GENDERS.map(value => ({ value, label: t(`genders.${value}`) })))}
      {select("experienceMin", t("experience"), EXPERIENCE_STEPS.map(value => ({ value: String(value), label: t("experienceMin", { years: value }) })))}
      <label htmlFor={`${idPrefix}-showFull`} className="flex min-h-target cursor-pointer items-center gap-3 text-base text-ink">
        <input id={`${idPrefix}-showFull`} type="checkbox" name="showFull" value="1" checked={draft.showFull}
          onChange={event => setDraft({ ...draft, showFull: event.target.checked })}
          className="size-5 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
        {t("showFull")}
      </label>
    </div>
  );
}

/** Draft filters. Desktop: a sidebar form. Mobile: a drawer with Apply / Clear / Cancel; Cancel restores the applied URL state.
 * Without JavaScript the same form submits as GET. */
export function DoctorFilters({ search, onApply, pending }: { search: DoctorSearch; onApply: (next: DoctorSearchInput) => void; pending: boolean }) {
  const t = useTranslations("booking.filters");
  const locale = useLocale();
  const [desktop, setDesktop] = useState<Draft>(() => draftFrom(search));
  const [mobile, setMobile] = useState<Draft>(() => draftFrom(search));
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(search);
  const hidden = (
    <>
      {search.q ? <input type="hidden" name="q" value={search.q} /> : null}
      {search.city ? <input type="hidden" name="city" value={search.city} /> : null}
      {search.pin ? <input type="hidden" name="pin" value={search.pin} /> : null}
      {search.sort !== "availability" ? <input type="hidden" name="sort" value={search.sort} /> : null}
    </>
  );
  return (
    <>
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={next => { setOpen(next); if (next) setMobile(draftFrom(search)); }}>
          <SheetTrigger asChild>
            <Button type="button" variant="secondary"><SlidersHorizontal aria-hidden />{count ? t("openCount", { count }) : t("open")}</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="p-5 sm:p-6">
            <SheetTitle className="pr-12 text-xl font-semibold text-ink">{t("title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("title")}</SheetDescription>
            <form method="get" action={`/${locale}/doctors`} className="mt-5 grid gap-6"
              onSubmit={event => { event.preventDefault(); setOpen(false); onApply(applyDraft(search, mobile)); }}>
              {hidden}
              <FilterFields draft={mobile} setDraft={setMobile} idPrefix="filters-mobile" />
              <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-3 border-t border-border bg-paper px-5 py-4 sm:-mx-6 sm:px-6">
                <Button type="submit" disabled={pending}>{t("apply")}</Button>
                <Button type="button" variant="secondary" onClick={() => { setOpen(false); onApply(applyDraft(search, null)); }}>{t("clear")}</Button>
                <Button type="button" variant="quiet" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>
      <form method="get" action={`/${locale}/doctors`} aria-labelledby="filters-desktop-title" className="hidden content-start gap-6 lg:grid"
        onSubmit={event => { event.preventDefault(); onApply(applyDraft(search, desktop)); }}>
        <h2 id="filters-desktop-title" className="text-lg font-semibold text-ink">{t("title")}</h2>
        {hidden}
        <FilterFields draft={desktop} setDraft={setDesktop} idPrefix="filters-desktop" />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>{t("apply")}</Button>
          <Button type="button" variant="quiet" onClick={() => { setDesktop(EMPTY_DRAFT); onApply(applyDraft(search, null)); }}>{t("clear")}</Button>
        </div>
      </form>
    </>
  );
}
