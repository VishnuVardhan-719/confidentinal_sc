import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { ConsultationEditor } from "@/components/clinical/editor/consultation-editor";
import { HealthFactsPanel } from "@/components/clinical/health-facts-panel";
import { PhotoConsentPanel } from "@/components/clinical/photo-consent-panel";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { Link } from "@/i18n/navigation";
import { getClinicalApi } from "@/modules/clinical";
import { loadConsultationWorkspace } from "@/modules/clinical/loaders";
import { getDoctorApi } from "@/modules/doctor";
import { getRecordsApi } from "@/modules/records";
import {
  confirmFactsAction,
  correctFactAction,
  finalizeAction,
  getConsultationAction,
  getDraftAction,
  photoConsentAction,
  saveDraftAction,
} from "../../../actions";

export async function generateMetadata() {
  const t = await getTranslations("clinical.workspace");
  return { title: t("title"), robots: { index: false } };
}

export default async function ConsultationPage({ params }: PageProps<"/[locale]/doctor/visits/[id]/consultation">) {
  const { locale, id } = await params;
  const g = await guardDoctorPage(locale, `/visits/${id}/consultation`);
  if (!g.ok) return g.view;
  const [t, nav, tc] = await Promise.all([getTranslations("clinical"), getTranslations("doctor.shell.nav"), getTranslations("doctor.visit")]);
  const ctx = g.session.ctx;
  const records = getRecordsApi(process.env, ctx);
  const state = await loadConsultationWorkspace({ doctor: getDoctorApi(process.env, ctx), clinical: getClinicalApi(process.env, ctx), records }, id);
  const crumbs = <Breadcrumb items={[{ label: nav("visits"), href: "/doctor/visits" }, { label: tc("titleFallback"), href: `/doctor/visits/${id}` }, { label: t("workspace.title") }]} />;
  const header = <PageHeader title={t("workspace.title")} breadcrumb={crumbs} />;

  if (state.kind === "gated") {
    // Gate first: no clinical data was fetched (loader order).
    return (
      <div className="grid gap-8">
        {header}
        <GateNotice feature="clinical">{t("gate.consultation")}</GateNotice>
      </div>
    );
  }
  if (state.kind !== "ready") {
    return (
      <div className="grid gap-8">
        {header}
        <PageStateView state={state} />
      </div>
    );
  }
  const data = state.data;
  if (data.mode === "signed") redirect({ href: `/doctor/records/${data.record.consultationId}`, locale: g.locale });
  if (data.mode === "not_started") {
    return (
      <div className="grid gap-8">
        {header}
        <Notice tone="info" action={<Button asChild variant="secondary"><Link href={`/doctor/visits/${id}`}>{t("workspace.backToVisit")}</Link></Button>}>
          {t("workspace.notStarted")}
        </Notice>
      </div>
    );
  }
  if (data.mode !== "editor") return null;

  const [consent, photos] = await Promise.all([records.getPhotoConsent(data.draft.consultationId), records.listPhotos(data.draft.consultationId)]);
  const allergyFactVersions = data.healthFacts.kind === "ready" ? data.healthFacts.data.filter((f) => f.kind === "allergy").map((f) => `${f.factId}:${f.current.version}`) : [];

  return (
    <div className="grid gap-10">
      {g.session.synthetic ? <p className="text-sm text-muted">{t("synthetic")}</p> : null}
      {/* One h1 per page (a11y sweep): breadcrumb + title above the sticky editor context. */}
      {header}
      <ConsultationEditor
        draft={data.draft}
        visit={data.visit}
        allergies={data.allergies}
        writable={data.writable}
        vitalRules={[]}
        allergyFactVersions={allergyFactVersions}
        actions={{ save: saveDraftAction, fetchLatest: getDraftAction, finalize: finalizeAction, getConsultation: getConsultationAction }}
      />
      <div className="grid gap-10 border-t border-border pt-8 xl:grid-cols-2">
        {data.healthFacts.kind === "ready" || data.healthFacts.kind === "empty" ? (
          <HealthFactsPanel bookingId={data.visit.bookingId} facts={data.healthFacts.kind === "ready" ? data.healthFacts.data : []} disabled={!data.writable} confirm={confirmFactsAction} correct={correctFactAction} />
        ) : (
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold text-ink">{t("facts.title")}</h2>
            <PageStateView state={data.healthFacts} headingLevel="h3" />
          </section>
        )}
        {consent.ok ? (
          <PhotoConsentPanel consultationId={data.draft.consultationId} initialConsent={consent.data} photos={photos.ok ? photos.data : []} disabled={!data.writable} record={photoConsentAction} />
        ) : null}
      </div>
    </div>
  );
}
