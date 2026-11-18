import type { Metadata } from "next";
import { providerForUser } from "@/components/app/demo-model";
import { requireDemoRole } from "@/components/app/require-role";
import { ProviderScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Requests" };

export default async function ProviderRequestsPage() {
  const session = await requireDemoRole("/provider");
  return <ProviderScreen provider={providerForUser(session.name)} />;
}