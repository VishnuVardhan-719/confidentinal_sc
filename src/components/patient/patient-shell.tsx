import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/shared/app-shell";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { OfflineBanner } from "@/components/shared/offline-banner";

/** Patient workspace frame shared by the bookings, records and notifications pages. Same nav targets as the dashboard. */
export async function PatientShell({ synthetic, children }: { synthetic: boolean; children: ReactNode }) {
  const t = await getTranslations("patient.shell");
  const nav: ShellNavItem[] = [
    { href: "/patient/dashboard", label: t("nav.dashboard"), icon: "home", primary: true },
    { href: "/doctors", label: t("nav.findDoctor"), icon: "stethoscope", primary: true },
    { href: "/patient/bookings", label: t("nav.bookings"), icon: "calendar", primary: true },
    { href: "/patient/profile", label: t("nav.profile"), icon: "user", primary: true },
    { href: "/patient/records", label: t("nav.records"), icon: "file" },
    { href: "/patient/notifications", label: t("nav.notifications"), icon: "bell" },
    { href: "/patient/health-profile", label: t("nav.healthProfile"), icon: "clipboard" },
  ];
  return (
    <AppShell workspaceLabel={t("workspace")} nav={nav}>
      <div className="mx-auto grid w-full max-w-content gap-8">
        {synthetic ? <FixtureNotice /> : null}
        <OfflineBanner className="empty:hidden" />
        {children}
      </div>
    </AppShell>
  );
}
