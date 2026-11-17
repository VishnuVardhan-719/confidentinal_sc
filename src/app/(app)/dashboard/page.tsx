import type { Metadata } from "next";
import { DemoBadge } from "@/components/app/demo-parts";
import { EmptyPanel } from "@/components/app/empty-panel";
import { AppPageHeader, SectionTitle } from "@/components/app/page-parts";
import { PatientVisits } from "@/components/app/patient-visits";
import { DEMO_PATIENT_NAME } from "@/components/app/demo-model";
import { isEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "Dashboard" };

export default function PatientDashboardPage() {
  const recordsOpen = isEnabled("clinical");
  return (
    <>
      <AppPageHeader title="Your visits" lead={`Signed in as ${DEMO_PATIENT_NAME}.`}>
        <DemoBadge className="mt-4" />
      </AppPageHeader>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
        <PatientVisits />

        <section aria-labelledby="records" className="min-w-0">
          <div className="mb-4 border-t border-[var(--ink)] pt-5">
            <SectionTitle id="records">Health records</SectionTitle>
          </div>
          {recordsOpen ? (
            <EmptyPanel icon="clipboard" title="No records yet">
              <p>Notes and reports from your visits will appear here after a visit is completed.</p>
            </EmptyPanel>
          ) : (
            <EmptyPanel icon="lock" tone="locked" title="Records are not available yet">
              <p>Doctor notes and lab reports will be shown here once records open. Nothing is stored in this area today.</p>
            </EmptyPanel>
          )}
        </section>
      </div>
    </>
  );
}
