import type { Metadata } from "next";
import { ProviderScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Requests" };

export default function ProviderRequestsPage() {
  return <ProviderScreen />;
}
