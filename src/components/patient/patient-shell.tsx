import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/shared/app-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { OfflineBanner } from "@/components/shared/offline-banner";
import type { FixtureActor } from "@/fixtures/clinical/world";
import { getNotificationsApi, unreadCount } from "@/modules/notifications";

/**
 * Shared patient workspace frame (dashboard, records, notifications). Bookings and profile pages are
 * owned by other branches and link here through the same nav paths. The unread count is
 * server-derived; when notifications are not connected, no count is shown.
 */
export async function PatientShell({ synthetic, fixtureActor, children }: { synthetic: boolean; fixtureActor: FixtureActor | null; children: ReactNode }) {
  const t = await getTranslations("patient.shell");
  const notes = await getNotificationsApi(process.env, { fixtureActor: fixtureActor ?? undefined }).listMine();
  const unread = notes.ok ? unreadCount(notes.data) : 0;
  const nav: ShellNavItem[] = [
    { href: "/patient/dashboard", label: t("nav.dashboard"), icon: "home", primary: true },
    { href: "/patient/bookings", label: t("nav.bookings"), icon: "calendar", primary: true },
    { href: "/patient/records", label: t("nav.records"), icon: "file", primary: true },
    { href: "/patient/notifications", label: t("nav.notifications"), icon: "bell", primary: true, ...(unread > 0 ? { count: unread } : {}) },
    { href: "/patient/profile", label: t("nav.profile"), icon: "user", primary: true },
    { href: "/doctors", label: t("nav.findDoctor"), icon: "stethoscope" },
  ];
  return (
    <AppShell workspaceLabel={t("workspace")} nav={nav}>
      <div className="mx-auto grid w-full max-w-content gap-10">
        {synthetic ? <FixtureNotice /> : null}
        <OfflineBanner className="empty:hidden" />
        {children}
      </div>
    </AppShell>
  );
}
