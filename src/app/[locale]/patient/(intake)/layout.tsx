import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AccountFrame } from "@/components/auth/account-frame";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";

/**
 * Patient intake pages owned by fe-b (profile at a glance, health profile, onboarding).
 * Uses the minimal signed-in frame until the patient workspace layout (AppShell) lands; then
 * this frame should be dropped so the pages sit inside the patient shell (REQUESTS R-FE06-04).
 */
export default async function PatientIntakeLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickNamespaces(messages, [...CLIENT_NAMESPACES, "onboarding"])}>
      <AccountFrame>{children}</AccountFrame>
    </NextIntlClientProvider>
  );
}
