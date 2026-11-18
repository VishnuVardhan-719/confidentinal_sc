import type { Metadata } from "next";
import { requireDemoRole } from "@/components/app/require-role";
import { DashboardScreen } from "@/components/app/screens";
import { isEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "Dashboard" };

export default async function PatientDashboardPage() {
  const session = await requireDemoRole("/dashboard");
  return <DashboardScreen name={session.name} recordsOpen={isEnabled("clinical")} />;
}