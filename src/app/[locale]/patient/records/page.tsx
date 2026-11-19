import { ArrowRight, FileCheck2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { getRecordsApi, patientRecordSummarySchema } from "@/modules/records";

export async function generateMetadata() {
  const t = await getTranslations("patient.records");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * DC09 patient records list: the signed-in patient's SIGNED visit records only (drafts never appear).
 * Shows reference, visit time, signer and version; no clinical content leaves the detail page.
 */
export default async function PatientRecordsPage({ params }: PageProps<"/[locale]/patient/records">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  // Advisory UI guard; the records API authorizes every read independently.
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/records`));

  const [t, format] = await Promise.all([getTranslations("patient.records"), getFormatter()]);
  const ist = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const records = getRecordsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined });
  const result = await records.listMyRecords().catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/records`));

  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (!result.ok) {
    const code = result.error.code;
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        {code === "gated" ? (
          <GateNotice feature="clinical">{t("state.gated")}</GateNotice>
        ) : code === "forbidden" || code === "not_found" ? (
          <Notice tone="neutral" icon="lock" title={t("state.denied")} />
        ) : (
          <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />
        )}
      </PatientShell>
    );
  }

  // Defensive: render only well-formed summaries, newest visit first.
  const items = result.data
    .filter((r) => patientRecordSummarySchema.safeParse(r).success)
    .sort((a, b) => Date.parse(b.visitAt) - Date.parse(a.visitAt));

  if (items.length === 0) {
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        <EmptyState
          title={t("empty.title")}
          description={t("empty.body")}
          action={
            <Button asChild variant="secondary">
              <Link href="/patient/bookings">{t("empty.action")}</Link>
            </Button>
          }
        />
      </PatientShell>
    );
  }

  return (
    <PatientShell synthetic={session.synthetic}>
      {header}
      <section aria-labelledby="records-list" className="grid gap-4">
        <h2 id="records-list" className="text-lg font-semibold text-ink">
          {t("list.label", { count: items.length })}
        </h2>
        <ul className="grid gap-3">
          {items.map((r) => (
            <li
              key={r.consultationId}
              className="grid gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-forest/60 sm:grid-cols-[auto_1fr_auto] sm:items-start"
            >
              <span aria-hidden className="hidden size-10 items-center justify-center rounded-full bg-mist text-forest sm:inline-flex">
                <FileCheck2 className="size-5" />
              </span>
              <div className="grid min-w-0 gap-1">
                <p className="font-semibold text-ink tabular">{t("row.visit", { time: ist(r.visitAt) })}</p>
                <p className="text-ink">{t("row.doctor", { name: r.doctorDisplayName })}</p>
                <p className="text-sm text-muted tabular">
                  {t("row.reference", { reference: r.bookingReference })} · {t("row.version", { version: r.currentVersion })} ·{" "}
                  {t("row.lastSigned", { time: ist(r.lastSignedAt) })}
                </p>
                {r.amended ? (
                  <p className="w-fit rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">{t("row.amended")}</p>
                ) : null}
              </div>
              <Button asChild variant="secondary">
                <Link href={`/patient/records/${r.consultationId}`}>
                  {t("row.open")}
                  <span className="sr-only"> {r.bookingReference}</span>
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t("list.scope")}</p>
      </section>
    </PatientShell>
  );
}
