import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { ProviderDirectory } from "@/components/service-requests/provider-directory";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { pinSchema } from "@/modules/catalog/schemas";
import { createLabOrdersApi } from "@/modules/lab-orders/api";
import type { LabProvider } from "@/modules/lab-orders/types";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { AccessDenied } from "@/components/auth/access-denied";
import { servicePatientApi } from "@/modules/service-requests/server";

export async function generateMetadata() {
  const t = await getTranslations("services.lab");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Labs that collect samples at home, filtered by the patient's PIN. */
export default async function PatientLabTestsPage({ params, searchParams }: PageProps<"/[locale]/patient/lab-tests">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/lab-tests`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const rawPin = first((await searchParams).pin)?.trim() || null;
  const pin = rawPin ? pinSchema.safeParse(rawPin) : null;
  const t = await getTranslations("services.lab");
  const result = await createLabOrdersApi({ patient: servicePatientApi() }).listProviders(pin?.success ? { pin: pin.data } : {})
    .catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  return (
    <ServicesShell>
      {session.synthetic ? <FixtureNotice /> : null}
      <PageHeader title={t("pageTitle")} description={t("description")} />
      <ProviderDirectory<LabProvider> segment="/patient/lab-tests" result={result} pin={pin?.success ? pin.data : null} pinInvalid={pin !== null && !pin.success}
        requestLabel={t("request")} fromPaise={provider => Math.min(...provider.tests.map(test => test.pricePaise))}
        meta={provider => (
          <p className="text-sm text-ink">{t("testsCount", { count: provider.tests.length })}: {provider.tests.map(test => test.name).join(", ")}</p>
        )} />
    </ServicesShell>
  );
}
