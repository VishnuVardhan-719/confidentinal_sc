import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ProviderDirectory } from "@/components/service-requests/provider-directory";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { pinSchema } from "@/modules/catalog/schemas";
import { createAmbulanceRequestsApi } from "@/modules/ambulance-requests/api";
import type { AmbulanceProvider } from "@/modules/ambulance-requests/types";
import { EmergencyBanner } from "@/components/service-requests/emergency-banner";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";

export async function generateMetadata() {
  const t = await getTranslations("services.ambulance");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Operators for scheduled, non-emergency transfers, filtered by the patient's PIN. The 112 notice comes first. */
export default async function PatientAmbulancePage({ params, searchParams }: PageProps<"/[locale]/patient/ambulance">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/ambulance`));
  const rawPin = first((await searchParams).pin)?.trim() || null;
  const pin = rawPin ? pinSchema.safeParse(rawPin) : null;
  const t = await getTranslations("services.ambulance");
  const result = await createAmbulanceRequestsApi({ patient: servicePatientApi() }).listProviders(pin?.success ? { pin: pin.data } : {})
    .catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  return (
    <ServicesShell>
      <EmergencyBanner />
      {session.synthetic ? <FixtureNotice /> : null}
      <PageHeader title={t("pageTitle")} description={t("description")} />
      <ProviderDirectory<AmbulanceProvider> segment="/patient/ambulance" result={result} pin={pin?.success ? pin.data : null} pinInvalid={pin !== null && !pin.success}
        requestLabel={t("request")} fromPaise={provider => Math.min(...provider.vehicles.map(vehicle => vehicle.farePaise))}
        meta={provider => (
          <p className="text-sm text-ink">{t("vehicles")}: {provider.vehicles.map(vehicle => t(`vehicleType.${vehicle.type}`)).join(", ")}</p>
        )} />
    </ServicesShell>
  );
}
