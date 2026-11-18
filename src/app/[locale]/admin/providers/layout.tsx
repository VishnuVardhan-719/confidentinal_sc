import type { ReactNode } from "react";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";

export default function AdminProvidersLayout({ children }: { children: ReactNode }) {
  return <OnboardingLayout>{children}</OnboardingLayout>;
}