import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/shared/app-shell";

/** Patient workspace frame for lab tests, caretakers and ambulance transfers. */
export async function ServicesShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("patient.shell");
  const s = await getTranslations("services.nav");
  const nav: ShellNavItem[] = [
    { href: "/patient/dashboard", label: t("nav.dashboard"), icon: "home", primary: true },
    { href: "/doctors", label: t("nav.findDoctor"), icon: "stethoscope", primary: true },
    { href: "/patient/lab-tests", label: s("labTests"), icon: "flask", primary: true },
    { href: "/patient/caretakers", label: s("caretakers"), icon: "care" },
    { href: "/patient/ambulance", label: s("ambulance"), icon: "ambulance" },
    { href: "/patient/bookings", label: t("nav.bookings"), icon: "calendar", primary: true },
    { href: "/patient/profile", label: t("nav.profile"), icon: "user", primary: true },
  ];
  return (
    <AppShell workspaceLabel={t("workspace")} nav={nav}>
      <div className="mx-auto grid w-full max-w-content gap-8">{children}</div>
    </AppShell>
  );
}
