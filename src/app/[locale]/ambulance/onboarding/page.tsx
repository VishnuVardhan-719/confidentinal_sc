import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/page-loading";
import { ProviderOnboarding } from "@/components/onboarding/provider-onboarding";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.providerWizard");
  return { title: t("title.ambulance"), robots: { index: false, follow: false } };
}

export default function AmbulanceOnboardingPage({ searchParams }: PageProps<"/[locale]/ambulance/onboarding">) {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <ProviderOnboarding category="ambulance" searchParams={searchParams} />
    </Suspense>
  );
}