import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { formatDateTime, formatPaise, type Locale } from "@/lib/format";
import { bookingStatusPresentation, type StatusPresentation } from "@/modules/bookings/status";
import { paymentStatusPresentation } from "@/modules/payments/status";
import type { CancellationPolicyView } from "@/components/payments/cancellation-dialog";
import { cancellationTermsFor, cancelState, leadFor, type RequestLine, type ServiceRequest } from "@/modules/service-requests/core";
import { CancelRequest, RefreshRequest } from "./request-controls";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/**
 * One service request as the patient sees it: the provider's manual answer, separate booking / payment /
 * record badges, the server's price snapshot, history and cancellation. `now` is the server request time.
 */
export async function RequestStatusView<D>({ request, now, segment, title, record, recordTitle, recordNote, details, lineLabel, banner, cancel }: {
  request: ServiceRequest<D>; now: number; segment: string; title: string; record: StatusPresentation & { icon?: "lock" | "help" }; recordTitle: string;
  recordNote?: string; details: ReactNode; lineLabel: (line: RequestLine) => string; banner?: ReactNode;
  cancel: (id: unknown, version: unknown) => Promise<ApiResult<{ version: number }>>;
}) {
  const t = await getTranslations("services.common.status");
  const locale = (await getLocale()) as Locale;
  const lead = leadFor(request.status);
  const tone = lead === "declined" ? "warning" : lead === "confirmed" || lead === "completed" ? "info" : "neutral";
  const terms = cancellationTermsFor(request);
  const change = cancelState(request, now, terms?.cancelWindowMinutes ?? null);
  const policy: CancellationPolicyView = terms
    ? { state: "approved", version: terms.version, summary: t("policySummary"), feePaise: 0, refundPaise: null }
    : { state: "unavailable" };
  return (
    <>
      {banner}
      {request.synthetic ? <FixtureNotice /> : null}
      <div><Button asChild variant="quiet"><Link href={segment}><ArrowLeft aria-hidden />{t("back")}</Link></Button></div>
      <PageHeader title={title} description={request.publicReference ? t("reference", { reference: request.publicReference }) : t("noReference")} />

      <section aria-labelledby="request-status" className="grid gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <h2 id="request-status" className="sr-only">{t("statusTitle")}</h2>
        <Notice tone={tone} title={t(`lead.${lead}.title`, { name: request.providerName })}>{t(`lead.${lead}.body`, { name: request.providerName })}</Notice>
        {lead === "declined" || lead === "expired" ? <div><Button asChild><Link href={segment}>{t("findAnother")}</Link></Button></div> : null}
        <dl className="grid gap-3 sm:grid-cols-3" aria-label={t("statuses")}>
          <div className="grid gap-1"><dt className="text-sm text-muted">{t("booking")}</dt><dd><KeyedStatusBadge presentation={bookingStatusPresentation(request.status)} /></dd></div>
          <div className="grid gap-1"><dt className="text-sm text-muted">{t("payment")}</dt><dd><KeyedStatusBadge presentation={paymentStatusPresentation(request.payment.status)} /></dd></div>
          <div className="grid gap-1"><dt className="text-sm text-muted">{recordTitle}</dt><dd><KeyedStatusBadge presentation={record} /></dd></div>
        </dl>
        {recordNote ? <p className="text-sm text-muted">{recordNote}</p> : null}
        <IntlScope namespaces={["services"]}><RefreshRequest updatedAt={formatDateTime(new Date(now).toISOString(), locale)} /></IntlScope>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-8">
          <section aria-labelledby="request-details" className="grid gap-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <h2 id="request-details" className="text-lg font-semibold text-ink">{t("details")}</h2>
            <dl className="divide-y divide-border">
              <Row label={t("provider")}>{request.providerName}</Row>
              <Row label={t("time")}><span className="tabular">{formatDateTime(request.startAt, locale)}</span></Row>
              <Row label={t("area")}>{t("areaValue", { locality: request.address.locality, city: request.address.city, pin: request.address.pin })}</Row>
              {details}
            </dl>
          </section>

          {change !== "final" ? (
            <section aria-labelledby="request-changes" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
              <h2 id="request-changes" className="text-lg font-semibold text-ink">{t("changesTitle")}</h2>
              {change === "open"
                ? <IntlScope namespaces={["services", "payment"]}><CancelRequest id={request.id} version={request.version} policy={policy} cancel={cancel} /></IntlScope>
                : terms ? <Notice tone="neutral" title={t("changesClosed")} /> : null}
            </section>
          ) : null}

          <section aria-labelledby="request-timeline" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <h2 id="request-timeline" className="text-lg font-semibold text-ink">{t("timeline")}</h2>
            <ol className="grid gap-3">
              {request.events.map((event, index) => (
                <li key={`${event.status}-${index}`} className="grid gap-1 border-l-2 border-forest pl-4">
                  <span className="flex flex-wrap items-center gap-2"><KeyedStatusBadge presentation={bookingStatusPresentation(event.status)} /><span className="text-sm text-muted">{t(`actor.${event.actor}`)}</span></span>
                  <span className="text-sm text-muted tabular">{formatDateTime(event.at, locale)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-labelledby="request-price" className="grid content-start gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 id="request-price" className="text-lg font-semibold text-ink">{t("lines")}</h2>
          <dl className="divide-y divide-border">
            {request.lines.map(line => (
              <div key={line.key} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-base text-ink">{lineLabel(line)}{line.quantity > 1 ? <span className="text-muted tabular"> × {line.quantity}</span> : null}</dt>
                <dd className="text-base text-ink tabular">{formatPaise(line.amountPaise, locale)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 py-2"><dt className="font-semibold text-ink">{t("total")}</dt><dd className="font-semibold text-ink tabular">{formatPaise(request.totalPaise, locale)}</dd></div>
            <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-ink">{t("due")}</dt><dd className="text-ink tabular">{formatPaise(request.payment.amountDuePaise, locale)}</dd></div>
          </dl>
          <p className="text-sm text-muted">{t("priceNote")}</p>
        </aside>
      </div>
    </>
  );
}
