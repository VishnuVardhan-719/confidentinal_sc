import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmergencyBanner } from "@/components/service-requests/emergency-banner";
import { RequestStatusView } from "@/components/service-requests/request-status";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { LinkAction } from "@/components/service-requests/link-action";
import { InlineError } from "@/components/shared/inline-error";
import { PageHeader } from "@/components/shared/page-header";
import { createAmbulanceRequestsApi } from "@/modules/ambulance-requests/api";
import { ambulanceRecordPresentation } from "@/modules/ambulance-requests/status";
import type { VehicleType } from "@/modules/ambulance-requests/types";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";
import { AccessDenied } from "@/components/auth/access-denied";
import { cancelAmbulanceRequestAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("services.common.status");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
/** Server request time, read once per render after connection(). */
function readClock(): number { return Date.now(); }

/** A scheduled transfer request. No tracking or arrival time is shown; the 108 notice stays first. */
export default async function AmbulanceRequestStatusPage({ params }: PageProps<"/[locale]/patient/ambulance/requests/[id]">) {
  const { locale: raw, id } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/ambulance`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const found = await createAmbulanceRequestsApi({ patient: servicePatientApi() }).get(id).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  if (!found.ok && ["not_found", "validation", "forbidden"].includes(found.error.code)) notFound();
  const t = await getTranslations("services");
  if (!found.ok) return <ServicesShell><EmergencyBanner /><PageHeader title={t("common.status.pageTitle")} /><InlineError code={found.error.code} action={<><LinkAction href={`/patient/ambulance/requests/${id}`}>{t("common.form.retry")}</LinkAction><LinkAction href="/patient/ambulance" variant="quiet">{t("common.status.back")}</LinkAction></>} /></ServicesShell>;
  const r = found.data;
  const d = r.details;
  const row = (label: string, value: string) => (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"><dt className="text-sm font-medium text-muted">{label}</dt><dd className="text-base text-ink">{value}</dd></div>
  );
  const area = t("common.status.areaValue", { locality: d.destination.locality, city: d.destination.city, pin: d.destination.pin });
  const place = d.destination.name ? `${d.destination.name}, ${area}` : area;
  return (
    <ServicesShell>
      <RequestStatusView request={r} now={readClock()} segment="/patient/ambulance" title={t("ambulance.statusTitle", { name: r.providerName })}
        banner={<EmergencyBanner />}
        record={ambulanceRecordPresentation()} recordTitle={t("ambulance.recordTitle")} recordNote={t("ambulance.noTracking")} cancel={cancelAmbulanceRequestAction}
        lineLabel={line => (line.key.startsWith("vehicle:") ? t("ambulance.lineTransfer", { vehicle: t(`ambulance.vehicleType.${line.key.slice(8) as VehicleType}`) }) : line.label)}
        details={<>
          {row(t("ambulance.detailsVehicle"), t(`ambulance.vehicleType.${d.vehicleType}`))}
          {row(t("ambulance.detailsMobility"), t(`ambulance.mobilityValue.${d.mobility}`))}
          {row(t("ambulance.detailsDestination"), `${t(`ambulance.destinationKind.${d.destination.kind}`)}: ${place}`)}
          {row(t("ambulance.detailsCompanion"), d.companion ? t("ambulance.companionYes") : t("ambulance.companionNo"))}
        </>} />
    </ServicesShell>
  );
}
