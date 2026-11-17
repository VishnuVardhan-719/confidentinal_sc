"use client";

import { ButtonLink } from "@/components/button-link";
import { DEMO_PATIENT_NAME, allBookings, lookupBooking, splitVisits } from "./demo-model";
import { DemoBadge, VisitRow } from "./demo-parts";
import { useDemoState } from "./demo-store";
import { EmptyPanel } from "./empty-panel";
import { SectionTitle } from "./page-parts";

/** Upcoming and past visits for the demo patient, including requests sent from /book in this tab. */
export function PatientVisits() {
  const demo = useDemoState();
  const mine = allBookings(demo).filter((b) => b.patientName === DEMO_PATIENT_NAME);
  const { upcoming, past } = splitVisits(mine);

  return (
    <div className="grid gap-12">
      <section aria-labelledby="upcoming" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="upcoming">Upcoming</SectionTitle>
          <ButtonLink href="/book" variant="secondary" className="min-h-11">
            Request a visit
          </ButtonLink>
        </div>
        {upcoming.length ? (
          <ul className="m-0 list-none p-0">
            {upcoming.map((b) => {
              const { provider, service } = lookupBooking(b);
              return (
                <VisitRow
                  key={b.id}
                  startsAt={b.startsAt}
                  title={service?.name ?? "Visit"}
                  meta={`${provider?.name ?? "Unknown provider"} · ${provider?.city ?? ""}`}
                  status={b.status}
                />
              );
            })}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyPanel icon="calendar" title="No visits planned" actions={<ButtonLink href="/categories">Find care</ButtonLink>}>
              <p>When you send a request, it appears here until the provider responds.</p>
            </EmptyPanel>
          </div>
        )}
      </section>

      <section aria-labelledby="past" className="min-w-0">
        <div className="mb-2 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="past">Past</SectionTitle>
        </div>
        {past.length ? (
          <ul className="m-0 list-none p-0">
            {past.map((b) => {
              const { provider, service } = lookupBooking(b);
              return (
                <VisitRow
                  key={b.id}
                  muted
                  startsAt={b.startsAt}
                  title={service?.name ?? "Visit"}
                  meta={`${provider?.name ?? "Unknown provider"} · ${provider?.city ?? ""}`}
                  status={b.status}
                />
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-[var(--ink-soft)]">No past visits.</p>
        )}
      </section>
      <DemoBadge className="justify-self-start" />
    </div>
  );
}
