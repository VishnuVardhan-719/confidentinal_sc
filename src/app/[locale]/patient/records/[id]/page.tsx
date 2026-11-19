import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PdfPanel, SignedRecordView } from "@/components/clinical/signed-record";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import { latestSigned } from "@/modules/clinical/types";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { getRecordsApi, patientRecordDetailSchema } from "@/modules/records";
import { requestMyRecordPdfLinkAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("patient.record");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");
const idSchema = z.uuid();

/**
 * DC09 patient record detail: the signed version only, with signer attribution and amendments
 * (read-only), plus a short-lived PDF link (DC14). Unknown, unsigned and other patients' ids all
 * render the same "not available" state, so the page never reveals whether a record exists.
 */
export default async function PatientRecordPage({ params }: PageProps<"/[locale]/patient/records/[id]">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  // The return path is the list: a record id never travels through the login URL.
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/records`));

  const [t, tl] = await Promise.all([getTranslations("patient.record"), getTranslations("patient.records")]);
  const header = (reference?: string) => (
    <PageHeader
      title={t("title")}
      description={reference ? t("reference", { reference }) : undefined}
      breadcrumb={<Breadcrumb items={[{ label: tl("title"), href: "/patient/records" }, { label: reference ?? t("title") }]} />}
    />
  );
  const back = (
    <div>
      <Button asChild variant="quiet">
        <Link href="/patient/records">
          <ArrowLeft aria-hidden />
          {t("backToList")}
        </Link>
      </Button>
    </div>
  );
  const unavailable = (
    <PatientShell synthetic={session.synthetic}>
      {header()}
      <Notice tone="neutral" icon="lock">
        {t("notAvailable")}
      </Notice>
      {back}
    </PatientShell>
  );

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return unavailable;

  const records = getRecordsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined });
  const result = await records.getMyRecord(parsedId.data.toLowerCase()).catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/records`));

  if (!result.ok) {
    const code = result.error.code;
    if (code === "forbidden" || code === "not_found" || code === "validation") return unavailable;
    return (
      <PatientShell synthetic={session.synthetic}>
        {header()}
        {code === "gated" ? (
          <GateNotice feature="clinical">{tl("state.gated")}</GateNotice>
        ) : (
          <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />
        )}
        {back}
      </PatientShell>
    );
  }

  const parsed = patientRecordDetailSchema.safeParse(result.data);
  if (!parsed.success) return unavailable;
  const record = parsed.data;

  return (
    <PatientShell synthetic={session.synthetic}>
      {header(record.bookingReference)}
      <p className="text-sm text-muted">{t("readOnly")}</p>
      <IntlScope namespaces={["clinical"]}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <SignedRecordView record={record} />
          <aside aria-label={t("asideLabel")} className="grid content-start gap-8 lg:sticky lg:top-6">
            <PdfPanel consultationId={record.consultationId} version={latestSigned(record).version} request={requestMyRecordPdfLinkAction} />
          </aside>
        </div>
      </IntlScope>
      {back}
    </PatientShell>
  );
}
