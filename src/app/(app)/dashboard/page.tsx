import type { Metadata } from "next";
import { DashboardScreen } from "@/components/app/screens";
import { isEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "Your visits" };

export default function PatientDashboardPage() {
  return <DashboardScreen recordsOpen={isEnabled("clinical")} />;
}
