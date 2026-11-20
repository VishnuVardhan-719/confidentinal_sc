import { Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRoute } from "./access";
import { AccountForm } from "./account-form";
import { BookingFlow } from "./booking-flow";
import { EmptyPanel } from "./empty-panel";
import { AppPageHeader, SectionTitle } from "./page-parts";
import { PatientVisits } from "./patient-visits";
import { SessionGate } from "./session-gate";

/*
 * Screen bodies for the (app) routes. The page title is server-rendered so every route has its h1 at once;
 * the body sits behind a client SessionGate because the session lives in this browser tab.
 */

function Gated({ route, children }: { route: AppRoute; children: ReactNode }) {
  return <SessionGate route={route}>{children}</SessionGate>;
}

export function DashboardScreen({ recordsOpen }: { recordsOpen: boolean }) {
  return (
    <>
      <AppPageHeader title="Your visits" lead="Requests you have sent and their status. A request is not a booking until the provider accepts it." />
      <Gated route="/dashboard">
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
      </Gated>
    </>
  );
}

export function BookScreen() {
  return (
    <>
      <AppPageHeader
        title="Request a visit"
        lead="Choose the care you need, a provider and a time. The provider accepts or declines your request."
      />
      <Gated route="/book">
        {/* The flow reads ?category=&pin=&provider=&service= from the URL, which is only known in the browser. */}
        <Suspense fallback={<FlowSkeleton />}>
          <BookingFlow />
        </Suspense>
      </Gated>
    </>
  );
}

function FlowSkeleton() {
  return (
    <div className="max-w-[46rem]">
      <p role="status" className="visually-hidden">
        Loading the request form
      </p>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="mt-8 h-8 w-2/3" />
      <Skeleton className="mt-6 h-20 w-full" />
      <Skeleton className="mt-2 h-20 w-full" />
    </div>
  );
}

export function ProviderScreen() {
  return (
    <>
      <AppPageHeader title="Requests" lead="Patients send requests; nothing is accepted on your behalf." />
      <Gated route="/provider">
        <div className="max-w-[50rem]">
          <EmptyPanel icon="inbox" tone="locked" title="The provider request list is not available here yet" headingLevel={2}>
            <p>
              Reading and answering requests needs the provider workspace, which is still being built. No request has been
              accepted or declined for you, and patients see their request as waiting for the provider.
            </p>
          </EmptyPanel>
        </div>
      </Gated>
    </>
  );
}

export function OnboardingScreen() {
  return (
    <>
      <AppPageHeader
        title="Provider profile"
        lead="Set up the details patients will see. An admin checks every profile before it is listed."
      />
      <Gated route="/provider/onboarding">
        <div className="max-w-[50rem]">
          <EmptyPanel icon="clipboard" tone="locked" title="Provider applications are not open online yet" headingLevel={2}>
            <p>
              Applying needs document upload and review, which are still being connected. Nothing you enter elsewhere on the
              site creates a provider profile, and no profile is listed until an admin has checked it.
            </p>
          </EmptyPanel>
        </div>
      </Gated>
    </>
  );
}

export function AdminScreen() {
  return (
    <>
      <AppPageHeader
        title="Verification queue"
        lead="Provider profiles waiting for a document check. A provider is listed for patients only after approval."
      />
      <Gated route="/admin">
        <div className="max-w-[50rem]">
          <EmptyPanel icon="queue" tone="locked" title="The verification queue is not available here yet" headingLevel={2}>
            <p>
              Reviewing documents needs staff sign-in with a second factor and short-lived private document links. Both are
              still being connected, so no profile can be approved or rejected from this screen.
            </p>
          </EmptyPanel>
        </div>
      </Gated>
    </>
  );
}

export function AccountScreen() {
  return (
    <>
      <AppPageHeader title="Account" lead="Your name and language." />
      <Gated route="/account">
        <AccountForm />
      </Gated>
    </>
  );
}
