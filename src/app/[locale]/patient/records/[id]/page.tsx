import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PdfPanel, SignedRecordView } from "@/components/clinical/signed-record";
import { guardPatientPage } from "@/components/patient/guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { latestSigned } from "@/modules/clinical/types";
import { parseRouteId } from "@/modules/doctor/routing";
import { getRecordsApi } from "@/modules/records";
import { myRecordPdfLinkAction } from "../../actions";

export async function generateMetadata() {
  // Never put clinical details or names in the title.
  const t = await getTranslations("patient.records");
  return { title: t("detailTitle"), robots: { index: false } };
}

/** DC09/DC14 patient view of one signed record + private PDF of the signed version. */
export default async function PatientRecordPage({ params }: PageProps<"/[locale]/patient/records/[id]">) {
  const { locale, id: raw } = await params;
  const { session } = await guardPatientPage(locale, `/patient/records/${raw}`);
  const [t, tc] = await Promise.all([getTranslations("patient.records"), getTranslations("clinical")]);
  const header = (ref?: string) => (
    <PageHeader title={t("detailTitle")} breadcrumb={<Breadcrumb items={[{ label: t("title"), href: "/patient/records" }, { label: ref ?? t("detailTitle") }]} />} />
  );
  const shell = (body: React.ReactNode) => (
    <PatientShell synthetic={session.synthetic} fixtureActor={session.fixtureActor}>
      {body}
    </PatientShell>
  );

  if (!isClinicalEnabled()) {
    return shell(
      <>
        {header()}
        <GateNotice feature="clinical">{tc("gate.consultation")}</GateNotice>
      </>,
    );
  }
  const id = parseRouteId(raw);
  // Malformed IDs, other patients' records and drafts all look the same: not found.
  const r = id ? await getRecordsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined }).getMyRecord(id) : null;
  if (!r || !r.ok) {
    const code = r?.ok === false ? r.error.code : "not_found";
    return shell(
      <>
        {header()}
        {code === "not_found" || code === "forbidden" ? (
          <Notice tone="neutral" title={t("notFound")} />
        ) : code === "gated" ? (
          <GateNotice feature="clinical">{tc("gate.consultation")}</GateNotice>
        ) : (
          <InlineError code={code} action={code === "unavailable" ? <RetryAction /> : undefined} />
        )}
      </>,
    );
  }
  const record = r.data;
  return shell(
    <>
      {header(record.bookingReference)}
      <p className="text-sm text-muted">{t("readOnly")}</p>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SignedRecordView record={record} />
        <aside className="grid content-start gap-8">
          <PdfPanel consultationId={record.consultationId} version={latestSigned(record).version} request={myRecordPdfLinkAction} />
        </aside>
      </div>
    </>,
  );
}
