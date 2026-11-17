"use client";

import { DEMO_CARETAKER_LINKS } from "@/lib/demo/app";
import { allBookings, lookupBooking, splitVisits } from "./demo-model";
import { VisitRow } from "./demo-parts";
import { useDemoState } from "./demo-store";
import { EmptyPanel } from "./empty-panel";
import { SectionTitle } from "./page-parts";

/**
 * Caretaker view: the people they support and those people's upcoming visits, read-only.
 * Caretakers are non-clinical, so this shows when and with whom, never clinical details.
 */
export function CaretakerBoard() {
  const demo = useDemoState();
  const names = new Set(DEMO_CARETAKER_LINKS.map((l) => l.patientName));
  const { upcoming } = splitVisits(allBookings(demo).filter((b) => names.has(b.patientName)));

  return (
    <div className="grid gap-12">
      <section aria-labelledby="people" className="min-w-0">
        <div className="mb-2 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="people">People you support</SectionTitle>
        </div>
        <ul className="m-0 list-none p-0">
          {DEMO_CARETAKER_LINKS.map((l) => (
            <li key={l.patientName} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--line)] py-4">
              <span className="font-semibold">{l.patientName}</span>
              <span className="text-[0.9375rem] text-[var(--ink-soft)]">
                {l.relation} · {l.city}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="their-visits" className="min-w-0">
        <div className="mb-2 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="their-visits">Their upcoming visits</SectionTitle>
          <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">Read-only. Only the patient can change or cancel a visit.</p>
        </div>
        {upcoming.length ? (
          <ul className="m-0 list-none p-0">
            {upcoming.map((b) => {
              const { provider, service } = lookupBooking(b);
              return (
                <VisitRow
                  key={b.id}
                  startsAt={b.startsAt}
                  title={`${b.patientName}: ${service?.name ?? "Visit"}`}
                  meta={`${provider?.name ?? "Unknown provider"} · ${provider?.city ?? ""}`}
                  status={b.status}
                />
              );
            })}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyPanel icon="calendar" title="No upcoming visits">
              <p>When someone you support has a visit planned, it appears here.</p>
            </EmptyPanel>
          </div>
        )}
      </section>
    </div>
  );
}
