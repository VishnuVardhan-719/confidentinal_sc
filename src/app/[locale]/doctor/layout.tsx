import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { AppShell, type ShellNavItem } from "@/components/shared/app-shell";
import { pickNamespaces } from "@/i18n/messages";
import { getDoctorSession } from "@/modules/doctor/session";

/** Namespaces the doctor client islands need (the root provider ships only common/errors/accessibility). */
const DOCTOR_CLIENT_NAMESPACES = ["common", "errors", "accessibility", "doctor", "clinical", "consultationNotes", "prescriptionDrafts"] as const;

export default function DoctorLayout({ children }: LayoutProps<"/[locale]/doctor">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DoctorShell>{children}</DoctorShell>
    </Suspense>
  );
}

async function DoctorShell({ children }: { children: ReactNode }) {
  await connection();
  const [session, messages, t] = await Promise.all([getDoctorSession(), getMessages(), getTranslations("doctor.shell")]);
  const provider = (content: ReactNode) => (
    <NextIntlClientProvider messages={pickNamespaces(messages, DOCTOR_CLIENT_NAMESPACES)} timeZone="Asia/Kolkata">
      {content}
    </NextIntlClientProvider>
  );
  // Pages run the guard themselves (they know their path for a safe `next`). Without a session
  // no workspace navigation is rendered at all.
  if (session.guard.status !== "ok") return provider(<main className="flex-1 px-4 py-6">{children}</main>);

  const nav: ShellNavItem[] = [
    { href: "/doctor/dashboard", label: t("nav.overview"), icon: "home", primary: true },
    { href: "/doctor/requests", label: t("nav.requests"), icon: "inbox", primary: true },
    { href: "/doctor/visits", label: t("nav.visits"), icon: "calendar", primary: true },
    { href: "/doctor/availability", label: t("nav.availability"), icon: "clipboard" },
    { href: "/doctor/services", label: t("nav.services"), icon: "stethoscope" },
    { href: "/doctor/profile", label: t("nav.profile"), icon: "user", primary: true },
    { href: "/doctor/reviews", label: t("nav.reviews"), icon: "users" },
    { href: "/doctor/earnings", label: t("nav.earnings"), icon: "wallet" },
    { href: "/doctor/support", label: t("nav.support"), icon: "support" },
    { href: "/doctor/settings", label: t("nav.settings"), icon: "settings" },
  ];

  return provider(
    <AppShell workspaceLabel={t("workspace")} nav={nav}>
      <div className="mx-auto grid w-full max-w-content gap-6">
        {session.synthetic ? <FixtureNotice /> : null}
        <OfflineBanner className="empty:hidden" />
        {children}
      </div>
    </AppShell>,
  );
}
