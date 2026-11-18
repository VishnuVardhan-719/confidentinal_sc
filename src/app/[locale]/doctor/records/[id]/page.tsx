import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { AmendmentForm, PdfPanel, SignedRecordView } from "@/components/clinical/signed-record";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { getClinicalApi } from "@/modules/clinical";
import { loadSignedRecord } from "@/modules/clinical/loaders";
import { latestSigned } from "@/modules/clinical/types";
import { amendAction, getConsultationAction, pdfLinkAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("clinical.workspace");
  return { title: t("signedTitle"), robots: { index: false } };
}

export default async function SignedRecordPage({ params }: PageProps<"/[locale]/doctor/records/[id]">) {
  const { locale, id } = await params;
  const g = await guardDoctorPage(locale, `/records/${id}`);
  if (!g.ok) return g.view;
  const [t, nav] = await Promise.all([getTranslations("clinical"), getTranslations("doctor.shell.nav")]);
  const state = await loadSignedRecord({ clinical: getClinicalApi(process.env, g.session.ctx) }, id);
  const header = (ref?: string) => (
    <PageHeader title={t("workspace.signedTitle")} breadcrumb={<Breadcrumb items={[{ label: nav("visits"), href: "/doctor/visits" }, { label: ref ?? t("workspace.signedTitle") }]} />} />
  );

  if (state.kind === "gated") {
    return (
      <div className="grid gap-8">
        {header()}
        <GateNotice feature="clinical">{t("gate.consultation")}</GateNotice>
      </div>
    );
  }
  if (state.kind !== "ready") {
    return (
      <div className="grid gap-8">
        {header()}
        {state.kind === "not_found" ? <Notice tone="neutral">{t("record.notFound")}</Notice> : <PageStateView state={state} />}
      </div>
    );
  }
  const record = state.data;
  return (
    <div className="grid gap-10">
      {header(record.bookingReference)}
      {g.session.synthetic ? <p className="text-sm text-muted">{t("synthetic")}</p> : null}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SignedRecordView record={record} />
        <aside className="grid content-start gap-8">
          <PdfPanel consultationId={record.consultationId} version={latestSigned(record).version} request={pdfLinkAction} />
        </aside>
      </div>
      <AmendmentForm record={record} amend={amendAction} getConsultation={getConsultationAction} />
    </div>
  );
}
