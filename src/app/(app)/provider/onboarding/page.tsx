import type { Metadata } from "next";
import { requireDemoRole } from "@/components/app/require-role";
import { OnboardingScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Provider profile" };

export default async function ProviderOnboardingPage() {
  const session = await requireDemoRole("/provider/onboarding");
  return <OnboardingScreen role={session.role} />;
}