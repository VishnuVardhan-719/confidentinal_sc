import type { Metadata } from "next";
import { AdminQueue } from "@/components/app/admin-queue";
import { DemoBadge } from "@/components/app/demo-parts";
import { AppPageHeader } from "@/components/app/page-parts";

export const metadata: Metadata = { title: "Verification queue" };

export default function AdminVerificationPage() {
  return (
    <>
      <AppPageHeader
        title="Verification queue"
        lead="Provider profiles waiting for a document check. A provider is listed for patients only after approval."
      >
        <DemoBadge className="mt-4" />
      </AppPageHeader>
      <div className="max-w-[50rem]">
        <AdminQueue />
        <p className="mt-6 max-w-[40rem] text-[0.9375rem] text-[var(--ink-soft)]">
          In the real service, documents open through short-lived private links, and only for signed-in admins.
        </p>
      </div>
    </>
  );
}
