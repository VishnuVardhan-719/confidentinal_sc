import { ArrowRight, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { guardPatientPage } from "@/components/patient/guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getRecordsApi } from "@/modules/records";

export async function generateMetadata() {
  const t = await getTranslations("patient.records");
  return { title: t("title"), robots: { index: false } };
}

/** DC09 patient record list: signed records only (drafts never reach this view). */
export default async function PatientRecordsPage({ params }: PageProps<"/[locale]/patient/records">) {
  const { locale } = await params;
  const { session } = await guardPatientPage(locale, "/patient/records");
  const [t, tc, f] = await Promise.all([getTranslations("patient.records"), getTranslations("clinical"), getClinicalFormat()]);
  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (!isClinicalEnabled()) {
    // Gate first: no clinical request is made.
    return (
      <PatientShell synthetic={session.synthetic} fixtureActor={session.fixtureActor}>
        {header}
        <GateNotice feature="clinical">{tc("gate.consultation")}</GateNotice>
      </PatientShell>
    );
  }

  const r = await getRecordsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined }).listMyRecords();
  const items = r.ok ? [...r.data].sort((a, b) => b.visitAt.localeCompare(a.visitAt)) : [];

  return (
    <PatientShell synthetic={session.synthetic} fixtureActor={session.fixtureActor}>
      {header}
      {!r.ok ? (
        r.error.code === "forbidden" || r.error.code === "not_found" ? (
          <Notice tone="neutral" icon="lock" title={t("denied")} />
        ) : r.error.code === "gated" ? (
          <GateNotice feature="clinical">{tc("gate.consultation")}</GateNotice>
        ) : (
          <InlineError code={r.error.code} action={r.error.code === "unavailable" ? <RetryAction /> : undefined} />
        )
      ) : items.length === 0 ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyBody")}
          headingLevel="h2"
          action={
            <Button asChild variant="secondary">
              <Link href="/patient/bookings">{t("toBookings")}</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="records-list" className="grid gap-4">
          <h2 id="records-list" className="sr-only">
            {t("listLabel")}
          </h2>
          <ul className="grid gap-3">
            {items.map((rec) => (
              <li key={rec.consultationId} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex gap-3">
                  <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
                  <div className="grid gap-1">
                    <p className="font-semibold">{t("visitOn", { date: f.dateTime(rec.visitAt) })}</p>
                    <p className="text-sm text-muted">{t("doctor", { name: rec.doctorDisplayName })}</p>
                    <p className="text-sm text-muted tabular">
                      {t("reference", { reference: rec.bookingReference })} · {t("version", { version: rec.currentVersion })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone="success" icon="check" label={t("signedOn", { date: f.dateTime(rec.lastSignedAt) })} />
                      {rec.amended ? <StatusBadge tone="info" label={t("amended")} /> : null}
                    </div>
                  </div>
                </div>
                <Button asChild variant="secondary">
                  <Link href={`/patient/records/${rec.consultationId}`} aria-label={t("openFor", { reference: rec.bookingReference })}>
                    {t("open")}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PatientShell>
  );
}
