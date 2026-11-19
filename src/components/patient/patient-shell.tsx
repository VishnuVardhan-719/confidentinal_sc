import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/shared/app-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { OfflineBanner } from "@/components/shared/offline-banner";
import type { FixtureActor } from "@/fixtures/clinical/world";
import { pickNamespaces } from "@/i18n/messages";
import { getNotificationsApi, unreadCount } from "@/modules/notifications";

/** Namespaces the patient client islands need (record PDF panel, mark-read); root ships only common/errors/accessibility. */
const PATIENT_CLIENT_NAMESPACES = ["common", "errors", "accessibility", "clinical", "patient"] as const;

/**
 * Shared patient workspace frame (dashboard, bookings, records, notifications). The unread count is
 * server-derived; when notifications are not connected, no count is shown. `fixtureActor` is only
 * needed in fixture mode; callers that do not pass it get the http (bearer token) behaviour.
 */
export async function PatientShell({ synthetic, fixtureActor = null, children }: { synthetic: boolean; fixtureActor?: FixtureActor | null; children: ReactNode }) {
  const [t, messages] = await Promise.all([getTranslations("patient.shell"), getMessages()]);
  const notes = await getNotificationsApi(process.env, { fixtureActor: fixtureActor ?? undefined }).listMine();
  const unread = notes.ok ? unreadCount(notes.data) : 0;
  const nav: ShellNavItem[] = [
    { href: "/patient/dashboard", label: t("nav.dashboard"), icon: "home", primary: true },
    { href: "/patient/bookings", label: t("nav.bookings"), icon: "calendar", primary: true },
    { href: "/patient/records", label: t("nav.records"), icon: "file", primary: true },
    { href: "/patient/notifications", label: t("nav.notifications"), icon: "bell", primary: true, ...(unread > 0 ? { count: unread } : {}) },
    { href: "/patient/profile", label: t("nav.profile"), icon: "user", primary: true },
    { href: "/patient/health-profile", label: t("nav.healthProfile"), icon: "clipboard" },
    { href: "/doctors", label: t("nav.findDoctor"), icon: "stethoscope" },
  ];
  return (
    <NextIntlClientProvider messages={pickNamespaces(messages, PATIENT_CLIENT_NAMESPACES)} timeZone="Asia/Kolkata">
      <AppShell workspaceLabel={t("workspace")} nav={nav}>
        <div className="mx-auto grid w-full max-w-content gap-10">
          {synthetic ? <FixtureNotice /> : null}
          <OfflineBanner className="empty:hidden" />
          {children}
        </div>
      </AppShell>
    </NextIntlClientProvider>
  );
}
