"use client";

import { Building2, Loader2, MapPin, Search, Stethoscope, Thermometer, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { doctorSearchParams, SUGGESTION_GROUPS, taxonomySuggestions, SYMPTOMS, type Suggestion } from "@/modules/providers/doctor-search";
import { suggestDoctorsAction } from "./actions";

type Remote = { status: "idle" | "loading" | "error" } | { status: "ready"; items: Suggestion[] };
export type SuggestFn = (query: string) => Promise<ApiResult<{ items: Suggestion[] }>>;
const ICON = { speciality: Stethoscope, symptom: Thermometer, doctor: UserRound, clinic: Building2 } as const;
const DEBOUNCE_MS = 250;

/** Keep only characters the results URL accepts; never put anything else into the query string. */
export function cleanSearchText(value: string, max: number): string {
  return value.replace(/[^\p{L}\p{N} .,'&()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Practo-style type-ahead (WAI-ARIA combobox with grouped listbox). Works without JavaScript as a GET form.
 * Specialities and symptoms are matched locally in the active language; doctor and clinic names come
 * from the server adapter, debounced, and late responses for an older query are dropped.
 */
export function DoctorSearchBar({ defaultQuery = "", defaultCity = "", idPrefix = "doctor-search", suggest = suggestDoctorsAction, className }: {
  defaultQuery?: string; defaultCity?: string; idPrefix?: string; suggest?: SuggestFn; className?: string;
}) {
  const t = useTranslations("booking.search");
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const listId = `${idPrefix}-${uid}-list`;
  const [query, setQuery] = useState(defaultQuery);
  const [city, setCity] = useState(defaultCity);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<Remote>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const local = useMemo(() => taxonomySuggestions(query, {
    speciality: key => t(`specialities.${key}`), symptom: key => t(`symptoms.${key}`),
  }), [query, t]);
  const options = useMemo(() => {
    const all = [...local, ...(remote.status === "ready" ? remote.items : [])];
    return SUGGESTION_GROUPS.flatMap(group => all.filter(item => item.group === group));
  }, [local, remote]);
  const typed = query.trim().length >= 2;
  const expanded = open && typed;

  function onQueryChange(value: string) {
    setQuery(value);
    setOpen(true);
    setActive(-1);
    clearTimeout(timer.current);
    const id = ++sequence.current;
    const clean = cleanSearchText(value, 80);
    if (clean.length < 2) { setRemote({ status: "idle" }); return; }
    setRemote({ status: "loading" });
    timer.current = setTimeout(() => {
      suggest(clean).then(
        result => { if (id === sequence.current) setRemote(result.ok ? { status: "ready", items: result.data.items } : { status: "error" }); },
        () => { if (id === sequence.current) setRemote({ status: "error" }); },
      );
    }, DEBOUNCE_MS);
  }

  function go(params: Parameters<typeof doctorSearchParams>[0]) {
    const cleanCity = cleanSearchText(city, 60);
    const search = doctorSearchParams({ ...params, ...(/^\p{L}/u.test(cleanCity) && cleanCity.length >= 2 ? { city: cleanCity } : {}) }).toString();
    setOpen(false);
    router.push(search ? `/doctors?${search}` : "/doctors");
  }
  function choose(item: Suggestion) {
    if (item.group === "doctor") { setOpen(false); router.push(`/doctors/${item.providerId}`); return; }
    if (item.group === "speciality") go({ speciality: item.value });
    else if (item.group === "symptom") go({ symptom: item.value });
    else go({ q: cleanSearchText(item.label, 80) });
  }
  function submit() {
    if (expanded && active >= 0 && options[active]) { choose(options[active]); return; }
    const q = cleanSearchText(query, 80);
    go(q ? { q } : {});
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!options.length) return;
      setOpen(true);
      setActive(current => {
        const next = current + (event.key === "ArrowDown" ? 1 : -1);
        return next >= options.length ? -1 : next < -1 ? options.length - 1 : next;
      });
    } else if (event.key === "Escape") {
      if (expanded) { event.preventDefault(); setOpen(false); setActive(-1); } else setQuery("");
    }
  }
  const optionId = (index: number) => `${listId}-${index}`;
  const label = (item: Suggestion) => item.group === "speciality" ? t(`specialities.${item.value}`) : item.group === "symptom" ? t(`symptoms.${item.value}`) : item.label;
  const status = remote.status === "loading" ? t("loading") : remote.status === "error" ? t("error") : options.length === 0 ? t("empty") : null;

  return (
    <form role="search" method="get" action={`/${locale}/doctors`} className={cn("relative grid gap-3", className)}
      onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="grid gap-0 overflow-visible rounded-lg border border-border-strong bg-surface shadow-raised focus-within:border-forest md:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <div className="relative">
          <label htmlFor={`${idPrefix}-q`} className="sr-only">{t("label")}</label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input id={`${idPrefix}-q`} name="q" type="search" value={query} autoComplete="off" spellCheck={false} maxLength={80}
            placeholder={t("placeholder")} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            onChange={event => onQueryChange(event.target.value)} onKeyDown={onKeyDown} onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className="block min-h-14 w-full rounded-t-lg bg-transparent pr-4 pl-12 text-lg text-ink placeholder:text-muted focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus md:rounded-l-lg md:rounded-tr-none" />
        </div>
        <div className="relative border-t border-border md:border-t-0 md:border-l">
          <label htmlFor={`${idPrefix}-city`} className="sr-only">{t("cityLabel")}</label>
          <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input id={`${idPrefix}-city`} name="city" value={city} onChange={event => setCity(event.target.value)} maxLength={60}
            autoComplete="address-level2" placeholder={t("cityPlaceholder")}
            className="block min-h-14 w-full bg-transparent pr-4 pl-12 text-base text-ink placeholder:text-muted focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus" />
        </div>
        <div className="border-t border-border p-2 md:border-t-0 md:border-l">
          <Button type="submit" size="lg" className="w-full md:w-auto">{t("submit")}</Button>
        </div>
      </div>
      <p aria-live="polite" className="sr-only">{expanded ? status ?? t("suggestionCount", { count: options.length }) : ""}</p>
      <div id={listId} role="listbox" aria-label={t("label")} hidden={!expanded}
        className="absolute top-full right-0 left-0 z-40 mt-2 max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-overlay md:right-auto md:w-[min(40rem,100%)]">
        {status ? (
          <p className="flex items-center gap-2 px-3 py-3 text-base text-muted">
            {remote.status === "loading" ? <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> : null}
            {status}
          </p>
        ) : null}
        {SUGGESTION_GROUPS.map(group => {
          const items = options.map((item, index) => ({ item, index })).filter(entry => entry.item.group === group);
          if (!items.length) return null;
          const Icon = ICON[group];
          return (
            <div key={group} role="group" aria-labelledby={`${listId}-${group}`} className="py-1">
              <p id={`${listId}-${group}`} role="presentation" className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t(`groups.${group}`)}</p>
              {items.map(({ item, index }) => (
                <div key={optionId(index)} id={optionId(index)} role="option" aria-selected={index === active}
                  onMouseDown={event => event.preventDefault()} onClick={() => choose(item)} onMouseEnter={() => setActive(index)}
                  className={cn("flex min-h-target cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-base text-ink", index === active && "bg-mist")}>
                  <Icon aria-hidden className="size-4 shrink-0 text-forest" />
                  <span className="min-w-0 flex-1 truncate">{label(item)}</span>
                  {item.group === "symptom" ? <span className="hidden text-sm text-muted sm:inline">{t("symptomHint", { speciality: t(`specialities.${SYMPTOMS[item.value]}`) })}</span> : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </form>
  );
}
