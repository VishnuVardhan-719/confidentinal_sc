import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { RefreshStatus, RequestActions } from "@/components/booking/request-actions";
import { ReceiptLink } from "@/components/payments/document-link";
import { LinkAction } from "@/components/service-requests/link-action";
import { PaymentSummary } from "@/components/payments/payment-summary";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { KeyedStatusBadge, StatusBadge } from "@/components/shared/status-badge";
import { viewFromResult } from "@/components/shared/view-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatPaise, type Locale } from "@/lib/format";
import { SYNTHETIC_CANCELLATION_POLICY } from "@/fixtures/marketplace/booking-store";
import { journeyApis } from "@/modules/bookings/journey";
import type { Booking } from "@/modules/bookings/schemas";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { paymentStatusPresentation } from "@/modules/payments/status";
import { cancelBookingAction, listSlotsAction, rescheduleBookingAction } from "../actions";
import { AccessDenied } from "@/components/auth/access-denied";
import { PatientBookShell } from "../shell";

export async function generateMetadata() {
  const t = await getTranslations("booking.request");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string): Locale => (value === "te" || value === "hi" ? value : "en");
const LEADS = { REQUESTED: "requested", ACCEPTED: "confirmed", CONFIRMED: "confirmed", DECLINED: "declined", CANCELLED: "cancelled", COMPLETED: "completed" } as const;

/** Changes close at the cancellation window before the visit; a request the doctor has not answered can always change. */
function canChange(booking: Booking, now: number): "open" | "closed" | "final" {
  if (booking.status === "REQUESTED") return "open";
  if (booking.status !== "ACCEPTED" && booking.status !== "CONFIRMED") return "final";
  return now <= Date.parse(booking.startAt) - SYNTHETIC_CANCELLATION_POLICY.cancelWindowMinutes * 60_000 ? "open" : "closed";
}

/** Server request time; read once per render after connection(), so the page is never cached across requests. */
function readClock(): number { return Date.now(); }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/**
 * One booking request as the patient sees it: the doctor's answer (pending, confirmed or declined), separate
 * booking, payment and visit-record states, the server price snapshot, the timeline, changes and the receipt.
 */
export default async function BookingRequestPage({ params }: PageProps<"/[locale]/patient/book/[id]">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/book/${id}`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;

  const apis = journeyApis();
  const booking = await apis.bookings.get(id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  if (!booking.ok && ["not_found", "validation", "forbidden"].includes(booking.error.code)) notFound();
  const t = await getTranslations("booking.request");
  if (!booking.ok) {
    return <PatientBookShell><PageHeader title={t("pageTitle")} /><InlineError code={booking.error.code} action={<><LinkAction href={`/patient/book/${id}`}>{t("refresh")}</LinkAction><LinkAction href="/patient/dashboard" variant="quiet">{t("backToDashboard")}</LinkAction></>} /></PatientBookShell>;
  }
  const b = booking.data;
  const [timeline, payment, doctor] = await Promise.all([
    apis.bookings.timeline(b.id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
    apis.payments.getSummary(b.id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
    apis.doctors.get(b.providerId).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
  ]);
  const now = readClock();
  const doctorName = doctor.ok ? doctor.data.displayName : t("yourDoctor");
  const lead = LEADS[b.status as keyof typeof LEADS] ?? "other";
  const change = canChange(b, now);
  const paid = payment.ok && payment.data.status === "PAID";
  const tone = lead === "declined" ? "warning" : lead === "confirmed" || lead === "completed" ? "info" : "neutral";

  return (
    <PatientBookShell>
      {b.synthetic ? <FixtureNotice /> : null}
      <div><Button asChild variant="quiet"><Link href="/patient/dashboard"><ArrowLeft aria-hidden />{t("backToDashboard")}</Link></Button></div>
      <PageHeader title={t("title", { name: doctorName })}
        description={b.publicReference ? t("reference", { reference: b.publicReference }) : t("noReference")} />

      <section aria-labelledby="request-status" className="grid gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <h2 id="request-status" className="sr-only">{t("statusTitle")}</h2>
        <Notice tone={tone} title={t(`lead.${lead}.title`, { name: doctorName })}>{t(`lead.${lead}.body`, { name: doctorName })}</Notice>
        {lead === "declined" ? <div><Button asChild><Link href="/doctors">{t("findAnother")}</Link></Button></div> : null}
        <dl className="grid gap-3 sm:grid-cols-3" aria-label={t("statuses")}>
          <div className="grid gap-1"><dt className="text-sm text-muted">{t("bookingStatus")}</dt><dd><KeyedStatusBadge presentation={bookingStatusPresentation(b.status)} /></dd></div>
          <div className="grid gap-1"><dt className="text-sm text-muted">{t("paymentStatus")}</dt><dd>{payment.ok ? <KeyedStatusBadge presentation={paymentStatusPresentation(payment.data.status)} /> : <StatusBadge tone="neutral" icon="help" label={t("paymentUnknown")} />}</dd></div>
          <div className="grid gap-1"><dt className="text-sm text-muted">{t("clinicalStatus")}</dt><dd><StatusBadge tone="neutral" icon="lock" label={b.status === "COMPLETED" ? t("clinicalWithDoctor") : t("clinicalNone")} /></dd></div>
        </dl>
        <IntlScope namespaces={["booking"]}><RefreshStatus updatedAt={formatDateTime(new Date(now).toISOString(), locale)} /></IntlScope>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-8">
          <section aria-labelledby="request-details" className="grid gap-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <h2 id="request-details" className="text-lg font-semibold text-ink">{t("detailsTitle")}</h2>
            <dl className="divide-y divide-border">
              <Row label={t("doctor")}>{doctorName}</Row>
              <Row label={t("visit")}>{t("homeVisit")}</Row>
              <Row label={t("time")}><span className="tabular">{formatDateTime(b.startAt, locale)}</span></Row>
              <Row label={t("area")}><span className="tabular">{t("pin", { pin: b.pin })}</span></Row>
              <Row label={t("fee")}><span className="tabular">{formatPaise(b.priceSnapshot.amountPaise, locale)}</span><span className="block text-sm text-muted">{t("feeNote")}</span></Row>
              <Row label={t("payment")}>{t("payAfter")}<span className="block text-sm text-muted">{t("onlineDisabled")}</span></Row>
            </dl>
          </section>

          {change !== "final" ? (
            <section aria-labelledby="request-changes" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
              <h2 id="request-changes" className="text-lg font-semibold text-ink">{t("changesTitle")}</h2>
              {change === "open" ? (
                <IntlScope namespaces={["booking", "payment"]}>
                  <RequestActions bookingId={b.id} version={b.version} providerId={b.providerId} serviceId={b.serviceId}
                    policy={{ state: "approved", version: "synthetic-v1", summary: t("policySummary", { hours: SYNTHETIC_CANCELLATION_POLICY.cancelWindowMinutes / 60 }), feePaise: 0, refundPaise: null }}
                    actions={{ cancel: cancelBookingAction, reschedule: rescheduleBookingAction, slots: listSlotsAction }} />
                </IntlScope>
              ) : <Notice tone="neutral" title={t("changesClosed", { hours: SYNTHETIC_CANCELLATION_POLICY.cancelWindowMinutes / 60 })} />}
            </section>
          ) : null}

          <section aria-labelledby="request-timeline" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <h2 id="request-timeline" className="text-lg font-semibold text-ink">{t("timelineTitle")}</h2>
            {timeline.ok ? (
              <ol className="grid gap-3">
                {timeline.data.items.map(event => (
                  <li key={event.id} className="grid gap-1 border-l-2 border-forest pl-4">
                    <span className="flex flex-wrap items-center gap-2"><KeyedStatusBadge presentation={bookingStatusPresentation(event.status)} /><span className="text-sm text-muted">{t(`actor.${event.actorRole}`)}</span></span>
                    <span className="text-sm text-muted tabular">{formatDateTime(event.occurredAt, locale)}</span>
                  </li>
                ))}
              </ol>
            ) : <InlineError code={timeline.error.code} />}
          </section>
        </div>

        <aside className="grid content-start gap-6" aria-label={t("paymentAside")}>
          <PaymentSummary headingLevel="h2" view={viewFromResult(payment.ok ? { ok: true, data: {
            statusPresentation: paymentStatusPresentation(payment.data.status),
            lines: [{ label: t("feeLine"), amountPaise: b.priceSnapshot.amountPaise }],
            amountDuePaise: payment.data.amountDuePaise, collectedPaise: payment.data.collectedPaise, refundedPaise: payment.data.refundedPaise,
            method: payment.data.method, synthetic: payment.data.synthetic } } : payment)} />
          <section aria-labelledby="request-receipt" className="grid gap-3 rounded-lg border border-border bg-surface p-5">
            <h2 id="request-receipt" className="text-lg font-semibold text-ink">{t("receiptTitle")}</h2>
            <ReceiptLink doc={paid ? { state: "available", href: `/${locale}/patient/book/${b.id}/receipt`, issuer: "provider" } : { state: "not_issued", issuer: "provider" }} />
            {!paid ? <p className="text-sm text-muted">{t("receiptLater")}</p> : null}
          </section>
        </aside>
      </div>
    </PatientBookShell>
  );
}
