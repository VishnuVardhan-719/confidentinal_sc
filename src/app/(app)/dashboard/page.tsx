import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { EmptyPanel } from "@/components/app/empty-panel";
import { AppPageHeader, SectionTitle } from "@/components/app/page-parts";
import { isEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "Dashboard" };

export default function PatientDashboardPage() {
  const recordsOpen = isEnabled("clinical");
  return (
    <>
      <AppPageHeader title="Your visits" lead="Requests you send and visits a provider has accepted will show here." />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
        <section aria-labelledby="next-visit" className="min-w-0">
          <div className="mb-4 border-t border-[var(--ink)] pt-5">
            <SectionTitle id="next-visit">Next visit</SectionTitle>
          </div>
          <EmptyPanel
            icon="calendar"
            title="No visits planned"
            actions={
              <>
                <ButtonLink href="/categories">Find care</ButtonLink>
                <ButtonLink href="/book" variant="secondary">
                  Start a request
                </ButtonLink>
              </>
            }
          >
            <p>When a provider accepts your request, its date, time and provider will appear here.</p>
          </EmptyPanel>
        </section>

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
              <p>
                Doctor notes and lab reports will be shown here once records open. Nothing is stored in this area
                today.
              </p>
            </EmptyPanel>
          )}
        </section>
      </div>
    </>
  );
}
