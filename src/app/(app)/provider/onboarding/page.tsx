import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Provider profile" };

export default function ProviderOnboardingPage() {
  return <OnboardingScreen />;
}
