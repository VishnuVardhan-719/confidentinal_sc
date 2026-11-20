import type { Metadata } from "next";
import { AdminScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Verification queue" };

export default function AdminVerificationPage() {
  return <AdminScreen />;
}
