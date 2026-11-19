import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusBadge } from "@/components/shared/status-badge";
import { asTk, badgeFor, type Tk } from "@/components/clinical/kit";
import {
  bookingBadges,
  bookingDetailPath,
  canAskToReschedule,
  patientCancelState,
  paymentFor,
  providerDecision,
  timelineEntries,
} from "@/components/patient/booking-detail-logic";
import { CancelBookingForm } from "@/components/patient/cancel-booking-form";
import { PatientShell } from "@/components/patient/patient-shell";
import { RescheduleRequestForm } from "@/components/patient/reschedule-request-form";
import { Link } from "@/i18n/navigation";
import { fail, type ApiResult } from "@/lib/api/result";
import { formatDateTime, formatPaise, type Locale } from "@/lib/format";
import { createPatientBookingLoaders } from "@/modules/bookings/server-loaders";
import type { Booking, BookingEvent } from "@/modules/bookings/schemas";
import { authorizerFor, dashboardBookingsApi, getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { createPaymentsApi } from "@/modules/payments/api";
import type { PaymentSummary } from "@/modules/payments/schemas";
import { createProvidersApi } from "@/modules/providers/api";
import { getRecordsApi } from "@/modules/records";
import { cancelBookingAction, requestRescheduleAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("patient.booking");
  // Generic title: the booking reference and provider never go into the document title.
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");
const CATEGORIES = ["doctor", "lab", "ambulance", "caretaker"] as const;

/** Public directory entry for the booked service; null when the provider is no longer listed. */
async function providerFor(booking: Booking) {
  const r = await createProvidersApi(process.env)
    .get(booking.providerId, { category: booking.category, pin: booking.pin })
    .catch(() => fail("unavailable"));
  if (!r.ok) return null;
  return r.data.items.find((p) => p.id === booking.providerId && p.serviceId === booking.serviceId) ?? null;
}

export default async function PatientBookingDetailPage({ params }: PageProps<"/[locale]/patient/bookings/[id]">) {
  const { locale: raw, id: rawId } = await params;
  await connection();
  const locale = toLocale(raw);
  const id = z.uuid().safeParse(rawId).success ? rawId.toLowerCase() : null;
  const session = getPatientSession();
  // Advisory UI guard; the loaders and backend authorize every read and mutation independently.
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, bookingDetailPath(locale, id)));

  const [t, tc, tAll] = await Promise.all([getTranslations("patient.booking"), getTranslations("patient.dashboard.card"), getTranslations()]);
  const tk = asTk(tAll);
  const crumbs = (current: string) => (
    <Breadcrumb
      items={[
        { label: t("crumbBookings"), href: "/patient/bookings" },
        { label: current },
      ]}
    />
  );

  const shell = (children: ReactNode) => <PatientShell synthetic={session.synthetic}>{children}</PatientShell>;
  const notAvailable = shell(
    <>
      <PageHeader title={t("title")} breadcrumb={crumbs(t("title"))} />
      <Notice tone="neutral" icon="lock" title={t("state.notFound")}>
        <Link href="/patient/bookings" className="underline underline-offset-4">
          {t("backToList")}
        </Link>
      </Notice>
    </>,
  );
  if (!id) return notAvailable;

  const env = process.env;
  const loaders = createPatientBookingLoaders({
    authorizePatient: authorizerFor(env),
    api: dashboardBookingsApi(env),
    payments: createPaymentsApi(env),
  });
  const [detail, myRecords] = await Promise.all([
    loaders.detail(id, locale),
    getRecordsApi(env, { fixtureActor: session.fixtureActor ?? undefined }).listMyRecords().catch(() => fail("unavailable")),
  ]);

  if (!detail.ok) {
    const code = detail.error.code;
    if (code === "unauthenticated") redirect(patientLoginRedirect(locale, bookingDetailPath(locale, id)));
    // Forbidden and not-found look the same: never reveal that someone else's booking exists.
    if (code === "forbidden" || code === "not_found" || code === "validation") return notAvailable;
    return shell(
      <>
        <PageHeader title={t("title")} breadcrumb={crumbs(t("title"))} />
        {code === "gated" ? (
          <Notice tone="neutral" title={t("state.gated")} />
        ) : (
          <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />
        )}
      </>,
    );
  }

  const { booking, card, timeline, payment, actions } = detail.data;
  const badges = bookingBadges(card, payment, myRecords);
  const summary = paymentFor(payment, booking.id);
  const decision = providerDecision(booking.status);
  const cancelState = patientCancelState(actions, booking.status);
  const provider = await providerFor(booking);
  const category = CATEGORIES.find((c) => c === booking.category);
  const categoryLabel = category ? tc(`category.${category}`) : booking.category;
  const reference = booking.publicReference ? tc("reference", { reference: booking.publicReference }) : tc("noReference");

  const statusRows = [
    { label: tc("booking"), descriptor: badges.booking },
    ...(badges.visit ? [{ label: tc("visit"), descriptor: badges.visit }] : []),
    { label: tc("payment"), descriptor: badges.payment },
    { label: tc("clinical"), descriptor: badges.clinical },
  ];

  return shell(
    <>
      <PageHeader
        title={categoryLabel}
        description={<span className="tabular">{card.start}</span>}
        breadcrumb={crumbs(booking.publicReference ?? t("title"))}
        meta={<span className="tabular text-sm text-muted">{reference}</span>}
      />

      <section aria-labelledby="booking-status" className="grid gap-4 rounded-lg border border-border bg-surface p-5">
        <SectionHeading id="booking-status" title={t("status.title")} description={t("status.body")} size="md" />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statusRows.map((r) => (
            <div key={r.label} className="grid gap-1.5">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd>
                <StatusBadge {...badgeFor(r.descriptor, tk)} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1.5 border-t border-border pt-4">
          <p className="text-sm text-muted">{t("decision.label")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge {...badgeFor(decision, tk)} />
            <p className="text-sm text-muted">{t("decision.readOnly")}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-8">
          <section aria-labelledby="booking-visit" className="grid gap-4">
            <SectionHeading id="booking-visit" title={t("visit.title")} size="md" />
            <dl className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
              <Detail label={t("visit.when")}>
                <span className="tabular">{t("visit.range", { start: card.start, end: card.end })}</span>
                <span className="block text-sm text-muted">{t("visit.timeZone")}</span>
              </Detail>
              <Detail label={t("visit.provider")}>
                {provider ? (
                  <>
                    <span className="font-semibold">{provider.displayName}</span>
                    <span className="block text-sm text-muted">{provider.serviceTitle}</span>
                  </>
                ) : (
                  <span className="text-muted">{t("visit.providerUnavailable")}</span>
                )}
              </Detail>
              <Detail label={t("visit.category")}>{categoryLabel}</Detail>
              <Detail label={t("visit.pin")}>
                <span className="tabular">{booking.pin}</span>
              </Detail>
            </dl>
          </section>

          <section aria-labelledby="booking-timeline" className="grid gap-4">
            <SectionHeading id="booking-timeline" title={t("timeline.title")} size="md" />
            <Timeline result={timeline} locale={locale} tk={tk} />
          </section>
        </div>

        <aside className="grid gap-8" aria-label={t("asideLabel")}>
          <section aria-labelledby="booking-fee" className="grid gap-4 rounded-lg border border-border bg-surface p-5">
            <SectionHeading id="booking-fee" title={t("fee.title")} size="md" />
            <div className="grid gap-1">
              <p className="text-3xl font-semibold tabular">{card.price}</p>
              <p className="text-sm text-muted">{t("fee.snapshot")}</p>
            </div>
            <PaymentDetails summary={summary} locale={locale} tk={tk} badge={badges.payment} />
          </section>

          <section aria-labelledby="booking-manage" className="grid gap-6">
            <SectionHeading id="booking-manage" title={t("manage.title")} size="md" />
            <IntlScope namespaces={["patient"]}>
              <div className="grid gap-3">
                <h3 className="font-semibold">{t("cancel.title")}</h3>
                {cancelState.kind === "closed" ? (
                  <p className="text-sm text-muted">{t("cancel.closed")}</p>
                ) : (
                  <CancelBookingForm
                    bookingId={booking.id}
                    expectedVersion={booking.version}
                    policyApplies={cancelState.policyApplies}
                    serverGranted={cancelState.kind === "available"}
                    cancel={cancelBookingAction}
                  />
                )}
              </div>
              <div className="grid gap-3 border-t border-border pt-6">
                <h3 className="font-semibold">{t("reschedule.title")}</h3>
                {canAskToReschedule(booking.status) ? (
                  <RescheduleRequestForm bookingId={booking.id} expectedVersion={booking.version} submit={requestRescheduleAction} />
                ) : (
                  <p className="text-sm text-muted">{t("reschedule.closed")}</p>
                )}
              </div>
            </IntlScope>
          </section>
        </aside>
      </div>
    </>,
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function PaymentDetails({
  summary,
  locale,
  tk,
  badge,
}: {
  summary: PaymentSummary | null;
  locale: Locale;
  tk: Tk;
  badge: Parameters<typeof badgeFor>[0];
}) {
  const t = await getTranslations("patient.booking.payment");
  if (!summary) {
    return (
      <div className="grid gap-2 border-t border-border pt-4">
        <StatusBadge {...badgeFor(badge, tk)} />
        <p className="text-sm text-muted">{t("unavailable")}</p>
      </div>
    );
  }
  const rows = [
    { label: t("due"), value: formatPaise(summary.amountDuePaise, locale) },
    { label: t("collected"), value: formatPaise(summary.collectedPaise, locale) },
    ...(summary.refundedPaise > 0 ? [{ label: t("refunded"), value: formatPaise(summary.refundedPaise, locale) }] : []),
  ];
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...badgeFor(badge, tk)} />
        {summary.method ? <span className="text-sm text-muted">{t(`method.${summary.method}`)}</span> : null}
      </div>
      <dl className="grid gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="tabular font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t("separate")}</p>
    </div>
  );
}

async function Timeline({
  result,
  locale,
  tk,
}: {
  result: ApiResult<{ items: BookingEvent[] }>;
  locale: Locale;
  tk: Tk;
}) {
  const t = await getTranslations("patient.booking.timeline");
  if (!result.ok) return <p className="text-muted">{t("unavailable")}</p>;
  const entries = timelineEntries(result.data.items);
  if (entries.length === 0) return <p className="text-muted">{t("empty")}</p>;
  return (
    <ol className="grid gap-0 border-l-2 border-border pl-6">
      {entries.map((e, i) => (
        <li key={e.id} className="relative grid gap-0.5 pb-5 last:pb-0">
          <span
            aria-hidden
            className={`absolute -left-[1.95rem] top-1.5 size-3 rounded-full border-2 border-surface ${i === entries.length - 1 ? "bg-forest" : "bg-border"}`}
          />
          <p className="font-semibold">{tk(e.statusLabelKey)}</p>
          <p className="text-sm text-muted">
            <time dateTime={e.occurredAt} className="tabular">
              {formatDateTime(e.occurredAt, locale)}
            </time>{" "}
            · {tk(e.actorLabelKey)}
          </p>
        </li>
      ))}
    </ol>
  );
}
