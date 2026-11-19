import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import type { StatusDescriptor } from "@/components/shared/status";
import { ConsultationContext } from "@/components/doctor/consultation-context";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { PrescriptionDraftEditor } from "@/components/doctor/prescription-draft-editor";
import { Link } from "@/i18n/navigation";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getDoctorApi } from "@/modules/doctor";
import { parseRouteId, toPageState } from "@/modules/doctor/routing";
import { getPrescriptionDraftsApi } from "@/modules/prescription-drafts";
import { discardPrescriptionDraftAction, savePrescriptionDraftAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("prescriptionDrafts");
  return { title: t("title"), robots: { index: false } };
}

/** Template-only prescription draft for a completed booking. Never issued from the frontend. */
export default async function PrescriptionDraftPage({ params }: PageProps<"/[locale]/doctor/consultations/[bookingId]/prescription">) {
  const { locale, bookingId: raw } = await params;
  const g = await guardDoctorPage(locale, `/consultations/${raw}/prescription`);
  if (!g.ok) return g.view;
  const [t, nav, tn] = await Promise.all([getTranslations("prescriptionDrafts"), getTranslations("doctor.shell.nav"), getTranslations("consultationNotes")]);
  const id = parseRouteId(raw);
  const crumbs = (
    <Breadcrumb
      items={[
        { label: nav("visits"), href: "/doctor/visits" },
        ...(id ? [{ label: tn("title"), href: `/doctor/consultations/${id}` }] : []),
        { label: t("title") },
      ]}
    />
  );
  const frame = (body: React.ReactNode) => (
    <div className="grid gap-8">
      {g.session.synthetic ? <p className="text-sm text-muted">{t("synthetic")}</p> : null}
      <PageHeader title={t("title")} description={t("description")} breadcrumb={crumbs} />
      {body}
    </div>
  );

  if (!isClinicalEnabled()) return frame(<GateNotice feature="clinical">{t("gated")}</GateNotice>);
  if (!id) return frame(<PageStateView state={{ kind: "not_found" }} />);

  const ctx = g.session.ctx;
  const [visit, draft] = await Promise.all([getDoctorApi(process.env, ctx).getVisit(id), getPrescriptionDraftsApi(process.env, ctx).getDraft(id)]);
  for (const r of [visit, draft]) {
    if (!r.ok) {
      const s = toPageState(r);
      return frame(s.kind === "ready" ? null : <PageStateView state={s} />);
    }
  }
  if (!visit.ok || !draft.ok) return null;
  const badge: StatusDescriptor = draft.data ? { tone: "warning", icon: "pause", label: t("badge.draft") } : { tone: "neutral", label: t("badge.none") };
  const context = <ConsultationContext visit={visit.data} documentLabel={t("documentLabel")} documentBadge={badge} />;
  const notIssued = (
    <Notice tone="warning" title={t("notIssued.title")}>
      {t("notIssued.body")}
    </Notice>
  );

  if (visit.data.state !== "completed") {
    return frame(
      <>
        {context}
        <Notice
          tone="info"
          title={t("notCompleted.title")}
          action={
            <Button asChild variant="secondary">
              <Link href={`/doctor/visits/${id}`}>{tn("backToVisit")}</Link>
            </Button>
          }
        >
          {t("notCompleted.body")}
        </Notice>
      </>,
    );
  }
  return frame(
    <>
      {context}
      {notIssued}
      {/* key: a fresh editor after discard/reload so local rows never outlive the server draft. */}
      <PrescriptionDraftEditor key={`${draft.data?.version ?? 0}`} bookingId={id} initial={draft.data} actions={{ save: savePrescriptionDraftAction, discard: discardPrescriptionDraftAction }} />
    </>,
  );
}
