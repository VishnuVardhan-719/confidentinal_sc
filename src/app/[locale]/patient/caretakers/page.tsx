import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { ProviderDirectory } from "@/components/service-requests/provider-directory";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { pinSchema } from "@/modules/catalog/schemas";
import { createCareRequestsApi } from "@/modules/care-requests/api";
import type { CareProvider } from "@/modules/care-requests/types";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { AccessDenied } from "@/components/auth/access-denied";
import { servicePatientApi } from "@/modules/service-requests/server";

export async function generateMetadata() {
  const t = await getTranslations("services.care");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Caretakers and agencies for home care, filtered by the patient's PIN. */
export default async function PatientCaretakersPage({ params, searchParams }: PageProps<"/[locale]/patient/caretakers">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/caretakers`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const rawPin = first((await searchParams).pin)?.trim() || null;
  const pin = rawPin ? pinSchema.safeParse(rawPin) : null;
  const t = await getTranslations("services.care");
  const result = await createCareRequestsApi({ patient: servicePatientApi() }).listProviders(pin?.success ? { pin: pin.data } : {})
    .catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
  return (
    <ServicesShell>
      {session.synthetic ? <FixtureNotice /> : null}
      <PageHeader title={t("pageTitle")} description={t("description")} />
      <ProviderDirectory<CareProvider> segment="/patient/caretakers" result={result} pin={pin?.success ? pin.data : null} pinInvalid={pin !== null && !pin.success}
        requestLabel={t("request")} fromPaise={provider => provider.hourlyRatePaise * provider.minHours}
        meta={provider => (
          <div className="grid gap-1 text-sm text-ink">
            <p className="font-medium">{t(`kind.${provider.kind}`)}</p>
            <p>{t("languages", { languages: provider.languages.map(code => t(`lang.${code}`)).join(", ") })}</p>
            <p>{provider.tasks.map(task => t(`task.${task}`)).join(", ")}</p>
            <p className="tabular">{t("hoursRange", { min: provider.minHours, max: provider.maxHours })}</p>
          </div>
        )} />
    </ServicesShell>
  );
}
