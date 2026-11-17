import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/app/onboarding-flow";
import { AppPageHeader } from "@/components/app/page-parts";

export const metadata: Metadata = { title: "Provider profile" };

export default function ProviderOnboardingPage() {
  return (
    <>
      <AppPageHeader
        title="Provider profile"
        lead="Set up the details patients will see. An admin checks every profile before it is listed."
      />
      <OnboardingFlow />
    </>
  );
}
