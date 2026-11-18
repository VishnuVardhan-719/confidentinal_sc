import type { Metadata } from "next";
import { requireDemoRole } from "@/components/app/require-role";
import { AdminScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Verification queue" };

export default async function AdminVerificationPage() {
  await requireDemoRole("/admin");
  return <AdminScreen />;
}