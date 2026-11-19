import { getTranslations } from "next-intl/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import type { NotificationView } from "@/components/notifications/notifications";
import { NotificationsInbox } from "@/components/patient/notifications-inbox";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import type { Locale } from "@/lib/format";

import { notificationSchema } from "@/modules/notifications/schemas";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { markNotificationReadAction } from "./actions";
import { patientNotificationsApi } from "./api";

export async function generateMetadata() {
  const t = await getTranslations("patient.notifications");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * Patient notification inbox. Each item shows only the event kind and time (no health details) and
 * links to the authorized booking page when the server names one. The http adapter has no inbox
 * contract yet, so it shows an honest "not available yet" state instead of an empty inbox.
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

  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (!result.ok) {
    const code = result.error.code;
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        {code === "gated" ? (
          <GateNotice
            reason="contract_pending"
            title={t("state.gatedTitle")}
            action={
              <Button asChild variant="secondary">
                <Link href="/patient/bookings">{t("state.gatedAction")}</Link>
              </Button>
            }
          >
            {t("state.gated")}
          </GateNotice>
        ) : code === "forbidden" || code === "not_found" ? (
          <Notice tone="neutral" icon="lock" title={t("state.denied")} action={<DashboardAction />} />
        ) : (
          <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />
        )}
      </PatientShell>
    );
  }

  const valid = z.array(notificationSchema).safeParse(result.data.items);
  const rows = valid.success ? valid.data : [];
  const items: NotificationView[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    occurredAt: n.occurredAt,
    read: n.readAt !== null,
    href: n.bookingId ? `/patient/bookings/${n.bookingId}` : null,
  }));
  const versions = Object.fromEntries(rows.map((n) => [n.id, n.version]));

  return (
    <PatientShell synthetic={session.synthetic}>
      {header}
      {valid.success ? (
        <NotificationsInbox items={items} versions={versions} markRead={markNotificationReadAction} />
      ) : (
        <InlineError code="unavailable" action={<RetryAction />} />
      )}
    </PatientShell>
  );
}
