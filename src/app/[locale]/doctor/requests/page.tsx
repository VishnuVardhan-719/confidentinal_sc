import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { RequestList } from "@/components/doctor/visit-list";
import { getDoctorApi } from "@/modules/doctor";
import { loadRequests } from "@/modules/doctor/loaders";

export async function generateMetadata() {
  const t = await getTranslations("doctor.requests");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorRequestsPage({ params }: PageProps<"/[locale]/doctor/requests">) {
  const { locale } = await params;
  const g = await guardDoctorPage(locale, "/requests");
  if (!g.ok) return g.view;
  const t = await getTranslations("doctor.requests");
  const state = await loadRequests(getDoctorApi(process.env, g.session.ctx));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      {state.kind === "ready" ? (
        <RequestList requests={state.data} label={t("title")} now={new Date()} />
      ) : (
        <PageStateView state={state} empty={{ title: t("empty"), description: t("emptyBody") }} />
      )}
    </div>
  );
}
