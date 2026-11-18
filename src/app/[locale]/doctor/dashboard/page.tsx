import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeading } from "@/components/shared/section-heading";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { RequestList, VisitList } from "@/components/doctor/visit-list";
import { Link } from "@/i18n/navigation";
import { getDoctorApi } from "@/modules/doctor";
import { loadDoctorDashboard } from "@/modules/doctor/loaders";

export async function generateMetadata() {
  const t = await getTranslations("doctor.dashboard");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorDashboardPage({ params }: PageProps<"/[locale]/doctor/dashboard">) {
  const { locale } = await params;
  const g = await guardDoctorPage(locale, "/dashboard");
  if (!g.ok) return g.view;
  const t = await getTranslations("doctor.dashboard");
  const now = new Date();
  const d = await loadDoctorDashboard(getDoctorApi(process.env, g.session.ctx), now);

  return (
    <div className="grid gap-10">
      <PageHeader title={t("title")} description={t("description")} />

      {d.active ? (
        <section aria-labelledby="active-consultation" className="flex flex-col gap-4 rounded-lg bg-forest p-5 text-on-forest sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <h2 id="active-consultation" className="text-lg font-semibold">
              {t("active.title")}
            </h2>
            <p className="text-on-forest-muted">
              {d.active.patient.displayName} · {d.active.serviceName}
            </p>
          </div>
          <Button asChild variant="onForest">
            <Link href={`/doctor/visits/${d.active.bookingId}/consultation`}>
              {t("active.continue")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="pending-requests" className="grid gap-4">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading id="pending-requests" title={t("requests.title")} size="md" />
          <Link href="/doctor/requests" className="inline-flex min-h-target items-center text-forest underline-offset-4 hover:underline">
            {t("requests.viewAll")}
          </Link>
        </div>
        {d.requests.kind === "ready" ? (
          <RequestList requests={d.requests.data} label={t("requests.title")} now={now} />
        ) : (
          <PageStateView state={d.requests} empty={{ title: t("requests.empty"), description: t("requests.emptyBody") }} headingLevel="h3" />
        )}
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="today-visits" className="grid content-start gap-4">
          <SectionHeading id="today-visits" title={t("today.title")} size="md" />
          {d.today.kind === "ready" ? (
            <VisitList visits={d.today.data} label={t("today.title")} />
          ) : (
            <PageStateView state={d.today} empty={{ title: t("today.empty") }} headingLevel="h3" />
          )}
        </section>
        <section aria-labelledby="upcoming-visits" className="grid content-start gap-4">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading id="upcoming-visits" title={t("upcoming.title")} size="md" />
            <Link href="/doctor/visits" className="inline-flex min-h-target items-center text-forest underline-offset-4 hover:underline">
              {t("upcoming.viewAll")}
            </Link>
          </div>
          {d.upcoming.kind === "ready" ? (
            <VisitList visits={d.upcoming.data} label={t("upcoming.title")} />
          ) : (
            <PageStateView state={d.upcoming} empty={{ title: t("upcoming.empty") }} headingLevel="h3" />
          )}
        </section>
      </div>
    </div>
  );
}
