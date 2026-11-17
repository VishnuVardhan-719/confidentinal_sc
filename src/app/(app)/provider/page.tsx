import type { Metadata } from "next";
import { DemoBadge } from "@/components/app/demo-parts";
import { AppPageHeader } from "@/components/app/page-parts";
import { ProviderInbox } from "@/components/app/provider-inbox";

export const metadata: Metadata = { title: "Requests" };

export default function ProviderRequestsPage() {
  return (
    <>
      <AppPageHeader title="Requests" lead="Patients send requests; nothing is accepted on your behalf. You accept or decline each one.">
        <DemoBadge className="mt-4" />
      </AppPageHeader>
      <div className="max-w-[50rem]">
        <ProviderInbox />
      </div>
    </>
  );
}
