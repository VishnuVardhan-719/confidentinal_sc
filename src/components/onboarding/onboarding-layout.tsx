import { Suspense, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AccountFrame } from "@/components/auth/account-frame";
import { PageLoading } from "@/components/auth/page-loading";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";

/**
 * Frame for fe-b private pages (patient intake, provider onboarding, admin verification):
 * ships the `onboarding` namespace to client islands and adds the minimal signed-in header.
 * When a role AppShell layout exists above these routes, drop the AccountFrame here
 * (REQUESTS R-FE06-04) and keep only the messages provider.
 * Every user of this layout sits under a role layout that renders the page `<main>`, so the frame
 * is `nested` (no second main landmark; fe-int2 INT5).
 */
export async function OnboardingLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickNamespaces(messages, [...CLIENT_NAMESPACES, "onboarding"])}>
      {/* The frame reads the pathname (nav highlighting); dynamic routes need it inside Suspense. */}
      <Suspense fallback={<PageLoading />}>
        <AccountFrame nested>{children}</AccountFrame>
      </Suspense>
    </NextIntlClientProvider>
  );
}
