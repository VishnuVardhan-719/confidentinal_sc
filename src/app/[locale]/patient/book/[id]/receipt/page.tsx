import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatPaise, type Locale } from "@/lib/format";
import { journeyApis } from "@/modules/bookings/journey";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { AccessDenied } from "@/components/auth/access-denied";
import { PatientBookShell } from "../../shell";

export async function generateMetadata() {
  const t = await getTranslations("booking.receipt");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string): Locale => (value === "te" || value === "hi" ? value : "en");

/**
 * Payment receipt for a paid visit, rendered on the server from the recorded payment only. A pay-after visit is
 * paid to the doctor, so the doctor is the issuer; this page is not a tax invoice. No receipt exists before payment.
 */
export default async function BookingReceiptPage({ params }: PageProps<"/[locale]/patient/book/[id]/receipt">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/book/${id}/receipt`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const apis = journeyApis();
  const booking = await apis.bookings.get(id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  if (!booking.ok && ["not_found", "validation", "forbidden"].includes(booking.error.code)) notFound();
  const t = await getTranslations("booking.receipt");
  const back = <Button asChild variant="quiet"><Link href={`/patient/book/${id}`}><ArrowLeft aria-hidden />{t("back")}</Link></Button>;
  if (!booking.ok) return <PatientBookShell><div>{back}</div><PageHeader title={t("pageTitle")} /><InlineError code={booking.error.code} action={back} /></PatientBookShell>;
  const b = booking.data;
  const [payment, doctor] = await Promise.all([
    apis.payments.getSummary(b.id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
    apis.doctors.get(b.providerId).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
  ]);
  if (!payment.ok || payment.data.status !== "PAID") {
    return (
      <PatientBookShell>
        <div>{back}</div>
        <PageHeader title={t("pageTitle")} />
        {payment.ok ? <Notice tone="neutral" title={t("notIssuedTitle")}>{t("notIssuedBody")}</Notice> : <InlineError code={payment.error.code} />}
      </PatientBookShell>
    );
  }
  const p = payment.data;
  return (
    <PatientBookShell>
      {p.synthetic ? <FixtureNotice /> : null}
      <div>{back}</div>
      <PageHeader title={t("pageTitle")} description={t("description")} />
      <article aria-labelledby="receipt-title" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-8">
        <h2 id="receipt-title" className="font-display text-2xl font-medium text-ink">{t("heading", { reference: b.publicReference ?? t("noReference") })}</h2>
        <dl className="divide-y divide-border">
          {[
            [t("issuer"), t("issuerValue", { name: doctor.ok ? doctor.data.displayName : t("yourDoctor") })],
            [t("visit"), formatDateTime(b.startAt, locale)],
            [t("fee"), formatPaise(b.priceSnapshot.amountPaise, locale)],
            [t("paid"), formatPaise(p.collectedPaise, locale)],
            [t("method"), t("methodValue")],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm font-medium text-muted">{label}</dt>
              <dd className="text-base text-ink tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">{t("notInvoice")}</p>
      </article>
    </PatientBookShell>
  );
}
