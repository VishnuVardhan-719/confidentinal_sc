import { Suspense } from "react";
import type { DemoProvider, DemoRole } from "@/lib/demo/data";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountForm } from "./account-form";
import { AdminQueue } from "./admin-queue";
import { BookingFlow } from "./booking-flow";
import { CaretakerBoard } from "./caretaker-board";
import { DemoBadge } from "./demo-parts";
import { EmptyPanel } from "./empty-panel";
import { ROLE_LABEL, PROVIDER_WORK } from "./nav-model";
import { OnboardingFlow } from "./onboarding-flow";
import { AppPageHeader, SectionTitle } from "./page-parts";
import { PatientVisits } from "./patient-visits";
import { ProviderInbox } from "./provider-inbox";

/*
 * Screen bodies for the (app) routes. Each page file only checks the demo role (requireDemoRole) and passes
 * who is signed in here, so these render the same in tests without cookies.
 */

export function DashboardScreen({ name, recordsOpen }: { name: string; recordsOpen: boolean }) {
  return (
    <>
      <AppPageHeader title="Your visits" lead={`Signed in to the demo as ${name}.`}>
        <DemoBadge className="mt-4" />
      </AppPageHeader>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
        <PatientVisits patientName={name} />
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

export function BookScreen({ patientName }: { patientName: string }) {
  return (
    <>
      <AppPageHeader
        title="Request a visit"
        lead="Choose the care you need, a provider and a time. The provider accepts or declines your request."
      />
      {/* The flow reads ?provider=&service=&slot= from the URL, which is only known in the browser. */}
      <Suspense fallback={<FlowSkeleton />}>
        <BookingFlow patientName={patientName} />
      </Suspense>
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

export function ProviderScreen({ provider }: { provider: DemoProvider | undefined }) {
  if (!provider) {
    return (
      <>
        <AppPageHeader title="Requests" />
        <EmptyPanel icon="inbox" title="No provider profile for this account">
          <p>This demo account is not linked to a demo provider. Sign in as the demo doctor, lab or ambulance operator.</p>
        </EmptyPanel>
      </>
    );
  }
  const work = PROVIDER_WORK[provider.kind];
  const lead =
    provider.kind === "ambulance"
      ? "Scheduled, non-emergency transfers only. Patients send requests; you accept or decline each one."
      : "Patients send requests; nothing is accepted on your behalf. You accept or decline each one.";
  return (
    <>
      <AppPageHeader title={work.plural} lead={lead}>
        <DemoBadge className="mt-4" />
      </AppPageHeader>
      <div className="max-w-[50rem]">
        <ProviderInbox provider={provider} />
      </div>
    </>
  );
}

const ONBOARDING_KIND = { doctor: "doctor", lab: "lab", ambulance: "scheduled-ambulance" } as const;

export function OnboardingScreen({ role }: { role: DemoRole }) {
  const kind = role === "doctor" || role === "lab" || role === "ambulance" ? ONBOARDING_KIND[role] : undefined;
  return (
    <>
      <AppPageHeader
        title="Provider profile"
        lead="Set up the details patients will see. An admin checks every profile before it is listed."
      />
      <OnboardingFlow kind={kind} />
    </>
  );
}

export function CaretakerScreen({ name }: { name: string }) {
  return (
    <>
      <AppPageHeader title="People you support" lead={`Signed in to the demo as ${name}. Caretaker support is non-clinical.`}>
        <DemoBadge className="mt-4" />
      </AppPageHeader>
      <div className="max-w-[50rem]">
        <CaretakerBoard />
      </div>
    </>
  );
}

export function AdminScreen() {
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

export function AccountScreen({ role, name, email }: { role: DemoRole; name: string; email: string }) {
  return (
    <>
      <AppPageHeader title="Account" lead={`${ROLE_LABEL[role]} account. Your language and contact details.`} />
      <AccountForm role={role} name={name} email={email} />
    </>
  );
}
