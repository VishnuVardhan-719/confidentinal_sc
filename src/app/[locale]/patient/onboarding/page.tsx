import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/page-loading";

/**
 * Patient onboarding entry. The 13-item health profile form is the patient onboarding until
 * the step-by-step questionnaire ships, so this route forwards there. requireRole and the
 * profile gate both send incomplete patients here; the target page re-checks the role.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PatientOnboardingPage() {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <ForwardToHealthProfile />
    </Suspense>
  );
}

async function ForwardToHealthProfile(): Promise<never> {
  const locale = await getLocale();
  redirect(`/${locale}/patient/health-profile`);
}
