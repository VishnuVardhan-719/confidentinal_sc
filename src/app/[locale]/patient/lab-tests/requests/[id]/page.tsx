import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { RequestStatusView } from "@/components/service-requests/request-status";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { InlineError } from "@/components/shared/inline-error";
import { PageHeader } from "@/components/shared/page-header";
import { createLabOrdersApi } from "@/modules/lab-orders/api";
import { labReportPresentation } from "@/modules/lab-orders/status";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";
import { cancelLabOrderAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("services.common.status");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
/** Server request time, read once per render after connection(). */
function readClock(): number { return Date.now(); }

export default async function LabOrderPage({ params }: PageProps<"/[locale]/patient/lab-tests/requests/[id]">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  if (getPatientSession().status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/lab-tests`));
  const order = await createLabOrdersApi({ patient: servicePatientApi() }).get(id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  if (!order.ok && ["not_found", "validation", "forbidden"].includes(order.error.code)) notFound();
  const t = await getTranslations("services");
  if (!order.ok) return <ServicesShell><PageHeader title={t("common.status.pageTitle")} /><InlineError code={order.error.code} /></ServicesShell>;
  const o = order.data;
  return (
    <ServicesShell>
      <RequestStatusView request={o} now={readClock()} segment="/patient/lab-tests" title={t("lab.statusTitle", { name: o.providerName })}
        record={labReportPresentation(o.status)} recordTitle={t("lab.recordTitle")} recordNote={t("lab.reportNote")} cancel={cancelLabOrderAction}
        lineLabel={line => (line.key === "collection" ? t("lab.collectionFee") : line.label)}
        details={
          <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-muted">{t("lab.tests")}</dt>
            <dd className="text-base text-ink">
              <ul className="grid gap-1">{o.details.tests.map(test => <li key={test.id}>{test.name}<span className="block text-sm text-muted">{t("lab.testLine", { specimen: t(`lab.specimen.${test.specimen}`), preparation: t(`lab.preparation.${test.preparation}`) })}</span></li>)}</ul>
            </dd>
          </div>
        } />
    </ServicesShell>
  );
}
