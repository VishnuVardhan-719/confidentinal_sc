"use client";

import { Crosshair, List, Map as MapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LocationPicker, type ConfirmedLocation } from "@/components/booking/location-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { DOCTOR_SORTS, doctorSearchParams, formatCoordinates, type DoctorPage, type DoctorSearch, type DoctorSearchInput, type SearchOrigin } from "@/modules/providers/doctor-search";
import { searchDoctorsNearAction } from "./actions";
import { DoctorCard } from "./doctor-card";
import { DoctorFilters } from "./doctor-filters";

type Near = { status: "off" } | { status: "loading"; origin: SearchOrigin } | { status: "ready"; origin: SearchOrigin; page: DoctorPage } | { status: "error"; origin: SearchOrigin };
export type NearSearchFn = (search: string, origin: SearchOrigin) => Promise<ApiResult<DoctorPage>>;
const href = (input: DoctorSearchInput) => { const query = doctorSearchParams(input).toString(); return query ? `/doctors?${query}` : "/doctors"; };

/**
 * URL-driven results. Sort chips, filters and pages navigate (the router drops superseded navigations);
 * the old list stays visible but is marked stale and inert until the new one arrives.
 * A confirmed device location is sent only in a server-action body and kept in memory for this view.
 */
export function DoctorResults({ search, page, nearSearch = searchDoctorsNearAction }: { search: DoctorSearch; page: DoctorPage; nearSearch?: NearSearchFn }) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"list" | "map">("list");
  const [near, setNear] = useState<Near>({ status: "off" });
  const [dialog, setDialog] = useState(false);
  const navigate = (input: DoctorSearchInput) => { setNear({ status: "off" }); startTransition(() => router.push(href(input))); };
  const query = doctorSearchParams(search).toString();

  async function searchNear(origin: SearchOrigin) {
    setNear({ status: "loading", origin });
    const result = await nearSearch(query, origin).catch(() => null);
    setNear(result?.ok ? { status: "ready", origin, page: result.data } : { status: "error", origin });
  }
  function onConfirm(location: ConfirmedLocation) {
    setDialog(false);
    if (location.kind === "device") void searchNear(location.origin);
    else navigate({ ...search, city: location.city, pin: location.pin, page: 1 });
  }
  const shown = near.status === "ready" ? near.page : page;
  const sort = near.status === "off" ? search.sort : "nearest";
  const stale = pending || near.status === "loading";
  const place = near.status !== "off" ? formatCoordinates(near.origin) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:-mx-1 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:px-1">
        <DoctorFilters key={query} search={search} pending={pending} onApply={navigate} />
      </aside>
      <section aria-labelledby="results-heading" className="grid min-w-0 content-start gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="results-heading" className="text-xl font-semibold text-ink" aria-live="polite">{t("results.count", { count: shown.total })}</h2>
          <div role="group" aria-label={t("view.label")} className="inline-flex rounded-md border border-border bg-surface p-1">
            {(["list", "map"] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
                className={cn("inline-flex min-h-target items-center gap-2 rounded-sm px-3 text-base font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  view === mode ? "bg-forest text-on-forest" : "text-forest hover:bg-mist")}>
                {mode === "list" ? <List aria-hidden className="size-4" /> : <MapIcon aria-hidden className="size-4" />}{t(`view.${mode}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("sort.label")}>
          <span className="mr-1 text-sm font-semibold text-muted">{t("sort.label")}</span>
          {DOCTOR_SORTS.map(option => (
            <button key={option} type="button" aria-pressed={sort === option} disabled={stale}
              onClick={() => option === "nearest" ? (near.status === "off" ? navigate({ ...search, sort: "nearest", page: 1 }) : undefined) : navigate({ ...search, sort: option, page: 1 })}
              className={cn("min-h-target rounded-full border px-4 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60",
                sort === option ? "border-forest bg-forest text-on-forest" : "border-border-strong bg-surface text-ink hover:border-forest")}>
              {t(`sort.${option}`)}
            </button>
          ))}
          <Button type="button" variant="quiet" onClick={() => setDialog(true)}><Crosshair aria-hidden />{near.status === "off" ? t("results.useLocation") : t("results.changeLocation")}</Button>
          {near.status !== "off" ? <Button type="button" variant="quiet" onClick={() => setNear({ status: "off" })}>{t("results.clearLocation")}</Button> : null}
        </div>
        {sort === "nearest" && near.status === "off" ? <Notice tone="info">{t("sort.nearestNeedsLocation")}</Notice> : null}
        {place && near.status === "ready" ? <Notice tone="info">{t("results.nearestActive", { coordinates: place.coordinates, accuracy: place.accuracyM })}</Notice> : null}
        {near.status === "error" ? <Notice tone="warning">{t("results.errorBody")}</Notice> : null}
        <p aria-live="polite" className="sr-only">{stale ? t("results.stale") : ""}</p>
        <div aria-busy={stale} inert={stale} className={cn("grid gap-4 transition-opacity", stale && "opacity-60")} data-testid="doctor-results">
          {shown.items.length === 0 ? (
            <EmptyState icon="search" title={t("results.emptyTitle")} description={t("results.emptyBody")}
              action={<Button type="button" variant="secondary" onClick={() => navigate({ q: search.q, city: search.city })}>{t("results.emptyClear")}</Button>} />
          ) : view === "map" ? (
            <MapFallback page={shown} />
          ) : (
            <ol className="grid gap-4">
              {shown.items.map(doctor => <li key={doctor.providerId}><DoctorCard doctor={doctor} /></li>)}
            </ol>
          )}
          {shown.items.some(item => item.location === null) ? <p className="text-sm text-muted">{t("results.noLocationNote")}</p> : null}
        </div>
        {near.status === "off" && (page.page > 1 || page.hasMore) ? (
          <nav aria-label={t("results.pageOf", { page: page.page })} className="flex flex-wrap items-center gap-3">
            {page.page > 1 ? <Button asChild variant="secondary"><Link href={href({ ...search, page: page.page - 1 })}>{t("results.previous")}</Link></Button> : null}
            <span className="text-base text-muted tabular">{t("results.pageOf", { page: page.page })}</span>
            {page.hasMore ? <Button asChild variant="secondary"><Link href={href({ ...search, page: page.page + 1 })}>{t("results.next")}</Link></Button> : null}
          </nav>
        ) : null}
      </section>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="text-xl font-semibold text-ink">{t("results.locationDialogTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("location.consent")}</DialogDescription>
          <LocationPicker purpose="search" defaultCity={search.city} defaultPin={search.pin} onConfirm={onConfirm} onDiscard={() => setNear({ status: "off" })} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Honest stand-in until a map provider is approved: same results grouped by locality. */
function MapFallback({ page }: { page: DoctorPage }) {
  const t = useTranslations("booking");
  const groups = new Map<string, DoctorPage["items"]>();
  for (const item of page.items) {
    const key = item.location ? `${item.location.locality}, ${item.location.city}` : t("card.noLocation");
    groups.set(key, [...groups.get(key) ?? [], item]);
  }
  return (
    <div className="grid gap-5">
      <Notice tone="neutral" icon="lock" title={t("view.mapGatedTitle")}>{t("view.mapGatedBody")}</Notice>
      <ul className="grid gap-4">
        {[...groups.entries()].map(([place, items]) => (
          <li key={place} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-semibold text-ink">{place}</p>
            <ul className="mt-2 grid gap-1">
              {items.map(item => <li key={item.providerId}><Link className="text-forest underline-offset-4 hover:underline" href={`/doctors/${item.providerId}`}>{item.displayName}</Link></li>)}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
