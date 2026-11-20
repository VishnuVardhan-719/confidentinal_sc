import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { PageHeader } from "@/components/shared/page-header";
import { fail } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { markNotificationReadAction } from "./actions";
import { patientNotificationsApi } from "./api";
import { NotificationsBody } from "./_components/notifications-body";

export async function generateMetadata() {
  const t = await getTranslations("patient.notifications");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * Patient notification inbox. Signed out -> login with this page as `next`. The states (gated,
 * denied, error, empty, ready) are rendered by `NotificationsBody`; loading.tsx and error.tsx cover
 * the route. The http adapter has no inbox contract yet, so it shows an honest "not available yet"
 * state instead of an empty inbox.
 */
export default async function PatientNotificationsPage({ params }: PageProps<"/[locale]/patient/notifications">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/notifications`));

  const t = await getTranslations("patient.notifications");
  const result = await patientNotificationsApi(process.env)
    .list()
    .catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/notifications`));

  return (
    <PatientShell synthetic={session.synthetic}>
      <PageHeader title={t("title")} description={t("description")} />
      <NotificationsBody result={result} markRead={markNotificationReadAction} dashboardAction={<DashboardAction />} />
    </PatientShell>
  );
}
