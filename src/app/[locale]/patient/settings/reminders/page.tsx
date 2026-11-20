import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { IntlScope } from "@/components/shared/intl-scope";
import { PageHeader } from "@/components/shared/page-header";
import { fail } from "@/lib/api/result";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { getReminderPrefsApi } from "@/modules/reminder-prefs";
import { saveReminderPrefsAction } from "./actions";
import { ReminderBody, reminderPageState } from "./_components/reminder-body";
import { ReminderForm } from "./_components/reminder-form";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.reminders");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/**
 * Visit-reminder channels and quiet hours (IST). The server sends reminders; this page only stores
 * choices. Signed out -> login with this page as `next`; `ReminderBody` renders gated, denied, error
 * and the form; loading.tsx and error.tsx cover the route.
 */
export default async function ReminderSettingsPage({ params }: PageProps<"/[locale]/patient/settings/reminders">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/settings/reminders`));
  const [t, format] = await Promise.all([getTranslations("patientAccount.reminders"), getFormatter()]);
  const result = await getReminderPrefsApi(process.env, session.fixtureActor).get().catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/settings/reminders`));
  const state = reminderPageState(result);

  return (
    <PatientShell synthetic={session.synthetic}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        meta={state.kind === "ready" ? t("lastSaved", { time: format.dateTime(new Date(state.prefs.updatedAt), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) }) : undefined}
      />
      <ReminderBody
        state={state}
        dashboardAction={<DashboardAction />}
        renderForm={(prefs) => (
          <IntlScope namespaces={["patientAccount"]}>
            {/* Remount on a new server version so "Reload preferences" after a conflict shows fresh values. */}
            <ReminderForm key={prefs.version} prefs={prefs} save={saveReminderPrefsAction} />
          </IntlScope>
        )}
      />
    </PatientShell>
  );
}
