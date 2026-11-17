"use client";

import { useRef, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { providerById } from "@/lib/demo/data";
import { DEMO_PROVIDER_ID, STATUS_LABEL, allBookings, lookupBooking, type BookingStatus } from "./demo-model";
import { VisitRow } from "./demo-parts";
import { dispatchDemo, useDemoState } from "./demo-store";
import { EmptyPanel } from "./empty-panel";
import { SectionTitle } from "./page-parts";

const byStart = (a: { startsAt: string }, b: { startsAt: string }) => a.startsAt.localeCompare(b.startsAt);

/**
 * Inbox and schedule for the demo doctor. Accept / Decline only change this tab's demo state.
 * A polite live region announces each decision, and focus moves to the inbox heading because the
 * row (and the button that had focus) disappears from the inbox.
 */
export function ProviderInbox() {
  const demo = useDemoState();
  const [announcement, setAnnouncement] = useState("");
  const inboxHeading = useRef<HTMLHeadingElement>(null);
  const mine = allBookings(demo).filter((b) => b.providerId === DEMO_PROVIDER_ID);
  const requests = mine.filter((b) => b.status === "requested").sort(byStart);
  const schedule = mine.filter((b) => b.status === "accepted").sort(byStart);
  const declined = mine.filter((b) => b.status === "declined").sort(byStart);

  function respond(id: string, status: Extract<BookingStatus, "accepted" | "declined">, who: string) {
    dispatchDemo({ type: "setStatus", id, status });
    setAnnouncement(`${STATUS_LABEL[status]}: request from ${who}.`);
    inboxHeading.current?.focus();
  }

  return (
    <div className="grid gap-12">
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      <section aria-labelledby="inbox" className="min-w-0">
        <div className="mb-2 border-t border-[var(--ink)] pt-5">
          <h2
            id="inbox"
            ref={inboxHeading}
            tabIndex={-1}
            className="font-sans text-[1.125rem] leading-snug font-bold tracking-normal outline-none"
          >
            New requests <span className="font-semibold text-[var(--ink-soft)] tabular-nums">({requests.length})</span>
          </h2>
        </div>
        {requests.length ? (
          <ul className="m-0 list-none p-0">
            {requests.map((b) => {
              const { service } = lookupBooking(b);
              return (
                <VisitRow
                  key={b.id}
                  startsAt={b.startsAt}
                  title={b.patientName}
                  meta={service?.name}
                  status={b.status}
                  actions={
                    <>
                      <Button onClick={() => respond(b.id, "accepted", b.patientName)} aria-label={`Accept request from ${b.patientName}`}>
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => respond(b.id, "declined", b.patientName)}
                        aria-label={`Decline request from ${b.patientName}`}
                      >
                        Decline
                      </Button>
                    </>
                  }
                />
              );
            })}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyPanel icon="inbox" title="No new requests">
              <p>You have answered every request. New ones appear here when patients send them.</p>
            </EmptyPanel>
          </div>
        )}
      </section>

      <section aria-labelledby="schedule" className="min-w-0">
        <div className="mb-2 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="schedule">Schedule</SectionTitle>
        </div>
        {schedule.length ? (
          <ul className="m-0 list-none p-0">
            {schedule.map((b) => (
              <VisitRow key={b.id} startsAt={b.startsAt} title={b.patientName} meta={lookupBooking(b).service?.name} status={b.status} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[var(--ink-soft)]">Nothing scheduled. Accepted requests appear here.</p>
        )}
      </section>

      {declined.length ? (
        <section aria-labelledby="declined" className="min-w-0">
          <div className="mb-2 border-t border-[var(--ink)] pt-5">
            <SectionTitle id="declined">Declined</SectionTitle>
          </div>
          <ul className="m-0 list-none p-0">
            {declined.map((b) => (
              <VisitRow key={b.id} muted startsAt={b.startsAt} title={b.patientName} meta={lookupBooking(b).service?.name} status={b.status} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-[0.9375rem] text-[var(--ink-soft)]">
        Viewing as {providerById(DEMO_PROVIDER_ID)?.name}. Update your details in{" "}
        <ButtonLink href="/provider/onboarding" variant="quiet" className="min-h-11 px-1">
          Provider profile
        </ButtonLink>
        .
      </p>
    </div>
  );
}
