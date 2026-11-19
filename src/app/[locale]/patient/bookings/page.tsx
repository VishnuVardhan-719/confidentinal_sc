import { ChevronRight, RotateCcw } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { asTk } from "@/components/clinical/kit";
import { bookingBadges } from "@/components/patient/booking-detail-logic";
import { BookingRow, type BookingRowData } from "@/components/patient/booking-row";
import { BOOKING_FILTERS, BOOKINGS_PAGE_SIZE, bookingsHref, filterBookings, filterCounts, parseBookingsQuery } from "@/components/patient/bookings-query";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/format";
import { fail } from "@/lib/api/result";
import { createPatientBookingLoaders } from "@/modules/bookings/server-loaders";
import { authorizerFor, dashboardBookingsApi, getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { createPaymentsApi } from "@/modules/payments/api";
import { getRecordsApi } from "@/modules/records";

export async function generateMetadata() {
  const t = await getTranslations("patient.bookings");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

export default async function PatientBookingsPage({ params, searchParams }: PageProps<"/[locale]/patient/bookings">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  // Advisory UI guard; the loaders and backend authorize every read independently.
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/bookings`));

  const query = parseBookingsQuery(await searchParams);
  const [t, tAll] = await Promise.all([getTranslations("patient.bookings"), getTranslations()]);
  const tk = asTk(tAll);
  const env = process.env;
  const loaders = createPatientBookingLoaders({ authorizePatient: authorizerFor(env), api: dashboardBookingsApi(env) });
  const records = getRecordsApi(env, { fixtureActor: session.fixtureActor ?? undefined });
  const payments = createPaymentsApi(env);

  const [list, myRecords] = await Promise.all([
    loaders.list(locale, new Date().toISOString(), { limit: BOOKINGS_PAGE_SIZE, ...(query.cursor ? { cursor: query.cursor } : {}) }),
    records.listMyRecords().catch(() => fail("unavailable")),
  ]);
  if (!list.ok && list.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/bookings`));

  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (!list.ok) {
    const code = list.error.code;
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        {code === "forbidden" || code === "not_found" ? (
          <Notice tone="neutral" icon="lock" title={t("state.denied")} action={<DashboardAction />} />
        ) : code === "gated" ? (
          <Notice tone="neutral" title={t("state.gated")} action={<DashboardAction />} />
        ) : (
          <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />
        )}
      </PatientShell>
    );
  }

  const groups = { upcoming: list.data.upcoming, past: list.data.past, cancelled: list.data.cancelled };
  const counts = filterCounts(groups);
  const visible = filterBookings(groups, query.filter);
  const rows: BookingRowData[] = await Promise.all(
    visible.map(async (card) => ({
      id: card.id,
      reference: card.reference,
      category: card.category,
      start: card.start,
      price: card.price,
      badges: bookingBadges(
        card,
        await payments.getSummary(card.id).catch(() => fail("unavailable")),
        myRecords,
      ),
    })),
  );
  const nextCursor = list.data.hasMore ? list.data.nextCursor : null;

  if (counts.all === 0 && !query.cursor) {
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        <EmptyState
          title={t("empty.title")}
          description={t("empty.body")}
          action={
            <Button asChild>
              <Link href="/doctors">{t("empty.action")}</Link>
            </Button>
          }
        />
      </PatientShell>
    );
  }

  return (
    <PatientShell synthetic={session.synthetic}>
      {header}

      <section aria-labelledby="bookings-filter" className="grid gap-3">
        <h2 id="bookings-filter" className="sr-only">
          {t("filter.label")}
        </h2>
        <nav aria-label={t("filter.label")} className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex w-max gap-2">
            {BOOKING_FILTERS.map((f) => {
              const current = f === query.filter;
              return (
                <li key={f}>
                  <Link
                    href={bookingsHref({ filter: f, ...(query.cursor ? { cursor: query.cursor } : {}) })}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-target items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                      "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px",
                      current ? "border-forest bg-forest text-on-forest" : "border-border bg-surface text-ink hover:border-forest hover:bg-mist",
                    )}
                  >
                    {t(`filter.${f}`)}
                    <span className={cn("tabular rounded-full px-2 text-xs", current ? "bg-on-forest/15" : "bg-mist text-muted")}>{counts[f]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="text-sm text-muted">{t("filter.scope")}</p>
      </section>

      <section aria-labelledby="bookings-results" className="grid gap-4">
        <h2 id="bookings-results" className="sr-only">
          {t(`filter.${query.filter}`)}
        </h2>
        {rows.length > 0 ? (
          <ul className="grid gap-3">
            {rows.map((row) => (
              <BookingRow key={row.id} row={row} tk={tk} />
            ))}
          </ul>
        ) : counts.all === 0 ? (
          <EmptyState
            title={t("empty.endTitle")}
            description={t("empty.endBody")}
            headingLevel="h3"
            action={
              <Button asChild variant="secondary">
                <Link href={bookingsHref({ filter: query.filter })}>{t("pager.first")}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t("empty.filterTitle", { filter: t(`filter.${query.filter}`) })}
            description={t("empty.filterBody")}
            headingLevel="h3"
            action={
              <Button asChild variant="secondary">
                <Link href={bookingsHref({ filter: "all", ...(query.cursor ? { cursor: query.cursor } : {}) })}>{t("empty.showAll")}</Link>
              </Button>
            }
          />
        )}
      </section>

      {query.cursor || nextCursor ? (
        <nav aria-label={t("pager.label")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {query.cursor ? (
            <Button asChild variant="quiet">
              <Link href={bookingsHref({ filter: query.filter })}>
                <RotateCcw aria-hidden />
                {t("pager.first")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Button asChild variant="secondary">
              <Link href={bookingsHref({ filter: query.filter, cursor: nextCursor })}>
                {t("pager.next")}
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted">{t("pager.end")}</p>
          )}
        </nav>
      ) : null}
    </PatientShell>
  );
}
