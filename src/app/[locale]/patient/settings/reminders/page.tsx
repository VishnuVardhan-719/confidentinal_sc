import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { fail } from "@/lib/api/result";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { getReminderPrefsApi, reminderPrefsSchema } from "@/modules/reminder-prefs";
import { saveReminderPrefsAction } from "./actions";
import { ReminderForm } from "./_components/reminder-form";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.reminders");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/** Visit-reminder channels and quiet hours (IST). The server sends reminders; this page only stores choices. */
export default async function ReminderSettingsPage({ params }: PageProps<"/[locale]/patient/settings/reminders">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/settings/reminders`));
  const [t, format] = await Promise.all([getTranslations("patientAccount.reminders"), getFormatter()]);
  const result = await getReminderPrefsApi(process.env, session.fixtureActor).get().catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/settings/reminders`));
  const parsed = result.ok ? reminderPrefsSchema.safeParse(result.data) : null;

  return (
    <PatientShell synthetic={session.synthetic}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        meta={parsed?.success ? t("lastSaved", { time: format.dateTime(new Date(parsed.data.updatedAt), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) }) : undefined}
      />
      {!result.ok ? (
        result.error.code === "gated" ? (
          <GateNotice reason="contract_pending">{t("state.gated")}</GateNotice>
        ) : result.error.code === "forbidden" ? (
          <Notice tone="neutral" icon="lock" title={t("state.denied")} />
        ) : (
          <InlineError code={result.error.code} action={<RetryAction />} />
        )
      ) : !parsed?.success ? (
        <InlineError code="unavailable" action={<RetryAction />} />
      ) : (
        <IntlScope namespaces={["patientAccount"]}>
          {/* Remount on a new server version so "Reload preferences" after a conflict shows fresh values. */}
          <ReminderForm key={parsed.data.version} prefs={parsed.data} save={saveReminderPrefsAction} />
        </IntlScope>
      )}
    </PatientShell>
  );
}
