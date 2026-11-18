import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/page-loading";
import { ProviderOnboarding } from "@/components/onboarding/provider-onboarding";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.providerWizard");
  return { title: t("title.caretaker"), robots: { index: false, follow: false } };
}

export default function CaretakerOnboardingPage({ searchParams }: PageProps<"/[locale]/caretaker/onboarding">) {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <ProviderOnboarding category="caretaker" searchParams={searchParams} />
    </Suspense>
  );
}