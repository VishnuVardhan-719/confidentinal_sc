import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { guardPatientPage } from "@/components/patient/guard";
import { MarkReadButton } from "@/components/patient/mark-read-button";
import { NotificationList } from "@/components/patient/notification-list";
import { PatientShell } from "@/components/patient/patient-shell";
import { getNotificationsApi } from "@/modules/notifications";
import { markNotificationsReadAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("patient.notifications");
  return { title: t("title"), robots: { index: false } };
}

export default async function PatientNotificationsPage({ params }: PageProps<"/[locale]/patient/notifications">) {
  const { locale } = await params;
  const { session } = await guardPatientPage(locale, "/patient/notifications");
  const t = await getTranslations("patient.notifications");
  const r = await getNotificationsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined }).listMine();
  const unreadIds = r.ok ? r.data.filter((n) => !n.readAt).map((n) => n.id) : [];

  return (
    <PatientShell synthetic={session.synthetic} fixtureActor={session.fixtureActor}>
      <PageHeader title={t("title")} description={t("description")} actions={unreadIds.length > 0 ? <MarkReadButton ids={unreadIds} markRead={markNotificationsReadAction} /> : undefined} />
      {!r.ok ? (
        r.error.code === "gated" ? (
          <Notice tone="neutral" icon="lock" title={t("notConnected")}>
            {t("notConnectedBody")}
          </Notice>
        ) : (
          <InlineError code={r.error.code} action={r.error.code === "unavailable" ? <RetryAction /> : undefined} />
        )
      ) : r.data.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} headingLevel="h2" />
      ) : (
        <section aria-labelledby="notifications-list" className="grid gap-3">
          <h2 id="notifications-list" className="sr-only">
            {t("listLabel")}
          </h2>
          <p role="status" className="text-sm text-muted">
            {t("unreadCount", { count: unreadIds.length })}
          </p>
          <NotificationList items={r.data} label={t("listLabel")} />
        </section>
      )}
    </PatientShell>
  );
}
