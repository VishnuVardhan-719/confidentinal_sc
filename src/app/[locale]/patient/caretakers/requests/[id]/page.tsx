import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { RequestStatusView } from "@/components/service-requests/request-status";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { LinkAction } from "@/components/service-requests/link-action";
import { InlineError } from "@/components/shared/inline-error";
import { PageHeader } from "@/components/shared/page-header";
import { createCareRequestsApi } from "@/modules/care-requests/api";
import { careRecordPresentation } from "@/modules/care-requests/status";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";
import { cancelCareRequestAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("services.common.status");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
/** Server request time, read once per render after connection(). */
function readClock(): number { return Date.now(); }

export default async function CareRequestStatusPage({ params }: PageProps<"/[locale]/patient/caretakers/requests/[id]">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  if (getPatientSession().status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/caretakers`));
  const found = await createCareRequestsApi({ patient: servicePatientApi() }).get(id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  if (!found.ok && ["not_found", "validation", "forbidden"].includes(found.error.code)) notFound();
  const t = await getTranslations("services");
  if (!found.ok) return <ServicesShell><PageHeader title={t("common.status.pageTitle")} /><InlineError code={found.error.code} action={<><LinkAction href={`/patient/caretakers/requests/${id}`}>{t("common.form.retry")}</LinkAction><LinkAction href="/patient/caretakers" variant="quiet">{t("common.status.back")}</LinkAction></>} /></ServicesShell>;
  const r = found.data;
  const row = (label: string, value: string) => (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"><dt className="text-sm font-medium text-muted">{label}</dt><dd className="text-base text-ink">{value}</dd></div>
  );
  return (
    <ServicesShell>
      <RequestStatusView request={r} now={readClock()} segment="/patient/caretakers" title={t("care.statusTitle", { name: r.providerName })}
        record={careRecordPresentation()} recordTitle={t("care.recordTitle")} recordNote={t("care.recordNote")} cancel={cancelCareRequestAction}
        lineLabel={line => (line.key === "hours" ? t("care.lineHours") : line.label)}
        details={<>
          {row(t("care.hours"), t("care.hoursValue", { hours: r.details.hours }))}
          {row(t("care.tasks"), r.details.tasks.map(task => t(`care.task.${task}`)).join(", "))}
        </>} />
    </ServicesShell>
  );
}
