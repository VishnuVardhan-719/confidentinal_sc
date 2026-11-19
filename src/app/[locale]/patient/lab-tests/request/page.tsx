import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { z } from "zod";
import { LabRequestForm } from "@/components/service-requests/lab-request-form";
import { ServicesShell } from "@/components/service-requests/services-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createLabOrdersApi } from "@/modules/lab-orders/api";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { servicePatientApi } from "@/modules/service-requests/server";
import { AccessDenied } from "@/components/auth/access-denied";
import { createLabOrderAction, labSlotsAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("services.lab");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const unavailable = { ok: false as const, error: { code: "unavailable" as const } };

/** Lab order form. The URL carries only the public lab id; tests, address and time stay in the form. */
export default async function LabRequestPage({ params, searchParams }: PageProps<"/[locale]/patient/lab-tests/request">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/lab-tests`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const providerId = z.uuid().safeParse(first((await searchParams).providerId));
  const t = await getTranslations("services");
  const back = <Button asChild variant="quiet"><Link href="/patient/lab-tests"><ArrowLeft aria-hidden />{t("common.back")}</Link></Button>;
  if (!providerId.success) {
    return (
      <ServicesShell>
        <PageHeader title={t("lab.pageTitle")} />
        <Notice tone="neutral" title={t("common.missingTitle")} action={back}>{t("common.missingBody")}</Notice>
      </ServicesShell>
    );
  }
  const patient = servicePatientApi();
  const [provider, members, addresses] = await Promise.all([
    createLabOrdersApi({ patient }).getProvider(providerId.data).catch(() => unavailable),
    patient.listMembers().catch(() => unavailable),
    patient.listAddresses().catch(() => unavailable),
  ]);
  return (
    <ServicesShell>
      {session.synthetic ? <FixtureNotice /> : null}
      <div>{back}</div>
      <PageHeader title={provider.ok ? t("lab.requestTitle", { name: provider.data.name }) : t("lab.pageTitle")} description={t("lab.requestDescription")} />
      {!provider.ok ? (
        provider.error.code === "not_found" ? <Notice tone="neutral" title={t("common.missingTitle")} action={back}>{t("common.missingBody")}</Notice>
          : provider.error.code === "gated" ? <Notice tone="neutral" title={t("common.notConnectedTitle")}>{t("common.notConnectedBody")}</Notice>
          : <InlineError code={provider.error.code} />
      ) : !members.ok ? <InlineError code={members.error.code} /> : (
        <IntlScope namespaces={["services", "booking"]}>
          <LabRequestForm provider={provider.data} members={members.data.items} addresses={addresses.ok ? addresses.data.items : []}
            actions={{ slots: labSlotsAction, create: createLabOrderAction }} />
        </IntlScope>
      )}
    </ServicesShell>
  );
}
