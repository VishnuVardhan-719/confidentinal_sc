import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeading } from "@/components/shared/section-heading";
import { EmptyState } from "@/components/shared/empty-state";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { VisitList } from "@/components/doctor/visit-list";
import { getDoctorApi } from "@/modules/doctor";
import { loadVisits } from "@/modules/doctor/loaders";

export async function generateMetadata() {
  const t = await getTranslations("doctor.visits");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorVisitsPage({ params }: PageProps<"/[locale]/doctor/visits">) {
  const { locale } = await params;
  const g = await guardDoctorPage(locale, "/visits");
  if (!g.ok) return g.view;
  const t = await getTranslations("doctor.visits");
  const state = await loadVisits(getDoctorApi(process.env, g.session.ctx), new Date());
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      {state.kind !== "ready" ? (
        <PageStateView state={state} empty={{ title: t("empty"), description: t("emptyBody") }} />
      ) : (
        <>
          <section aria-labelledby="visits-today" className="grid gap-4">
            <SectionHeading id="visits-today" title={t("today")} size="md" />
            {state.data.today.length ? <VisitList visits={state.data.today} label={t("today")} /> : <EmptyState title={t("empty")} headingLevel="h3" />}
          </section>
          <section aria-labelledby="visits-upcoming" className="grid gap-4">
            <SectionHeading id="visits-upcoming" title={t("upcoming")} size="md" />
            {state.data.upcoming.length ? <VisitList visits={state.data.upcoming} label={t("upcoming")} /> : <EmptyState title={t("empty")} headingLevel="h3" />}
          </section>
        </>
      )}
    </div>
  );
}
