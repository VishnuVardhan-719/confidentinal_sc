import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { CareRequestForm } from "@/components/service-requests/care-request-form";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createCareRequestsApi } from "@/modules/care-requests/api";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";
import { careSlotsAction, createCareRequestAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("services.care");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const unavailable = { ok: false as const, error: { code: "unavailable" as const } };

/** Care request form. The URL carries only the public provider id; tasks, address, time and hours stay in the form. */
export default async function CareRequestPage({ params, searchParams }: PageProps<"/[locale]/patient/caretakers/request">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/caretakers`));
  const providerId = z.uuid().safeParse(first((await searchParams).providerId));
  const t = await getTranslations("services");
  const back = <Button asChild variant="quiet"><Link href="/patient/caretakers"><ArrowLeft aria-hidden />{t("common.back")}</Link></Button>;
  if (!providerId.success) {
    return (
      <ServicesShell>
        <PageHeader title={t("care.pageTitle")} />
        <Notice tone="neutral" title={t("common.missingTitle")} action={back}>{t("common.missingBody")}</Notice>
      </ServicesShell>
    );
  }
  const patient = servicePatientApi();
  const [provider, members, addresses] = await Promise.all([
    createCareRequestsApi({ patient }).getProvider(providerId.data).catch(() => unavailable),
    patient.listMembers().catch(() => unavailable),
    patient.listAddresses().catch(() => unavailable),
  ]);
  return (
    <ServicesShell>
      {session.synthetic ? <FixtureNotice /> : null}
      <div>{back}</div>
      <PageHeader title={provider.ok ? t("care.requestTitle", { name: provider.data.name }) : t("care.pageTitle")} description={t("care.requestDescription")} />
      {!provider.ok ? (
        provider.error.code === "not_found" ? <Notice tone="neutral" title={t("common.missingTitle")} action={back}>{t("common.missingBody")}</Notice>
          : provider.error.code === "gated" ? <Notice tone="neutral" title={t("common.notConnectedTitle")}>{t("common.notConnectedBody")}</Notice>
          : <InlineError code={provider.error.code} />
      ) : !members.ok ? <InlineError code={members.error.code} /> : (
        <IntlScope namespaces={["services", "booking"]}>
          <CareRequestForm provider={provider.data} members={members.data.items} addresses={addresses.ok ? addresses.data.items : []}
            actions={{ slots: careSlotsAction, create: createCareRequestAction }} />
        </IntlScope>
      )}
    </ServicesShell>
  );
}
