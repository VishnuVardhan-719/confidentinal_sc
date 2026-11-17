import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { EmptyPanel } from "@/components/app/empty-panel";
import { AppPageHeader, SectionTitle } from "@/components/app/page-parts";
import { NotConnected } from "@/components/app/stepper";

export const metadata: Metadata = { title: "Requests" };

export default function ProviderRequestsPage() {
  return (
    <>
      <AppPageHeader
        title="Requests"
        lead="Visit requests from patients arrive here. You decide whether to accept each one."
      />

      <section aria-labelledby="inbox" className="max-w-[46rem]">
        <div className="mb-4 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="inbox">Inbox</SectionTitle>
        </div>
        <EmptyPanel
          icon="inbox"
          title="No requests yet"
          actions={<ButtonLink href="/provider/onboarding">Complete your profile</ButtonLink>}
        >
          <p>Patients can send you requests only after your profile has been checked and booking opens.</p>
        </EmptyPanel>
      </section>

      <section aria-labelledby="responding" className="mt-12 max-w-[46rem]">
        <div className="mb-4 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="responding">Responding to a request</SectionTitle>
        </div>
        <p className="max-w-[38rem] text-[var(--ink-soft)]">
          Each request will show the service, the patient&apos;s preferred date and time of day, and their area. Nothing
          is accepted on your behalf: you accept or decline every request yourself.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            aria-disabled="true"
            aria-describedby="respond-not-connected"
            className="cursor-not-allowed opacity-55"
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            aria-disabled="true"
            aria-describedby="respond-not-connected"
            className="cursor-not-allowed opacity-55"
          >
            Decline
          </Button>
        </div>
        <div className="mt-3">
          <NotConnected id="respond-not-connected">
            Accept and decline are not connected yet. They will work once booking opens.
          </NotConnected>
        </div>
      </section>
    </>
  );
}
