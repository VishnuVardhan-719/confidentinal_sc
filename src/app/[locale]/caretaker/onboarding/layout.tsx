import type { ReactNode } from "react";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";

export default function CaretakerOnboardingLayout({ children }: { children: ReactNode }) {
  return <OnboardingLayout>{children}</OnboardingLayout>;
}