"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import {
  CATEGORY_LABEL,
  bookingListSchema,
  canCancel,
  catalogPageSchema,
  splitBookings,
  type Booking,
} from "@/lib/client/booking";
import { formatPaise, formatSlot } from "@/lib/client/format";
import { useRequest } from "@/lib/client/use-request";
import { EmptyPanel } from "./empty-panel";
import { SectionTitle } from "./page-parts";
import { VisitRow } from "./visit-parts";

const LIMIT = 50;

type Names = Record<string, { provider: string; service: string }>;

/**
 * Booking rows carry the public provider reference and service id, not names. Names come from the same
 * public catalog the patient booked from (GET /api/catalog/{reference}); if a provider is no longer listed
 * the row falls back to its reference. Best effort: a failure here never hides a booking.
 */
function useNames(bookings: readonly Booking[]): Names {
  const [names, setNames] = useState<Names>({});
  const wanted = [
    ...new Set(
      bookings
        .filter((b) => b.provider_reference && b.pin_code)
        .map((b) => `${b.provider_reference}|${b.category}|${b.pin_code}`),
    ),
  ].sort();
  const key = wanted.join(",");

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    Promise.all(
      key.split(",").map(async (entry) => {
        const [reference, category, pin] = entry.split("|") as [string, string, string];
        try {
          const body = await api<unknown>(`/api/catalog/${encodeURIComponent(reference)}`, {
            query: { category, pin },
            signal: controller.signal,
          });
          return catalogPageSchema.parse({ results: (body as { results?: unknown }).results ?? [] }).results;
        } catch {
          return [];
        }
      }),
    ).then((pages) => {
      if (controller.signal.aborted) return;
      const found: Names = {};
      for (const row of pages.flat()) {
        found[`${row.provider_reference}|${row.service_id}`] = { provider: row.display_name, service: row.service_title };
      }
      setNames(found);
    });
    return () => controller.abort();
  }, [key]);

  return names;
}

/** The signed-in patient's requests and visits, from GET /api/bookings. */
export function PatientVisits() {
  const [reload, setReload] = useState(0);
  const list = useRequest(`bookings|${reload}`, (signal) =>
    api<unknown>("/api/bookings", { auth: true, query: { limit: LIMIT }, signal }).then((body) => bookingListSchema.parse(body).items),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const bookings = list.status === "ready" ? list.data : [];
  const names = useNames(bookings);
  const { upcoming, past } = splitBookings(bookings);

  const refresh = (message: string | null) => {
    setNotice(message);
    setReload((n) => n + 1);
  };

  const title = (b: Booking) => names[`${b.provider_reference}|${b.service_id}`]?.service ?? CATEGORY_LABEL[b.category];
  const meta = (b: Booking) => {
    const provider = names[`${b.provider_reference}|${b.service_id}`]?.provider ?? b.provider_reference ?? "Provider";
    return `${provider} · ${formatPaise(b.amount_paise)} · Ref ${b.public_ref}`;
  };

  let body;
  if (list.status === "loading" || list.status === "idle") body = <Loading label="Loading your visits" />;
  else if (list.status === "error") {
    body = <ErrorState headingLevel="h3" title="Your visits could not be loaded" message={errorMessage(list.error)} onRetry={list.retry} />;
  } else {
    body = (
      <>
        {upcoming.length ? (
          <ul className="m-0 list-none p-0">
            {upcoming.map((b) => (
              <VisitRow
                key={b.id}
                startsAt={b.start_at}
                title={title(b)}
                meta={meta(b)}
                state={b.state}
                actions={canCancel(b) ? <CancelControl booking={b} label={title(b)} onDone={refresh} /> : undefined}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyPanel icon="calendar" title="No visits planned" actions={<ButtonLink href="/book">Request a visit</ButtonLink>}>
              <p>When you send a request, it appears here with its status until the provider responds.</p>
            </EmptyPanel>
          </div>
        )}
        {list.data.length === LIMIT ? (
          <p className="mt-4 text-[0.9375rem] text-[var(--ink-soft)]">Showing your {LIMIT} most recent requests.</p>
        ) : null}
      </>
    );
  }

  return (
    <div className="grid gap-12">
      <section aria-labelledby="upcoming" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink)] pt-5">
          <SectionTitle id="upcoming">Upcoming</SectionTitle>
          <ButtonLink href="/book" variant="secondary" className="min-h-11">
            Request a visit
          </ButtonLink>
        </div>
        <p role="status" className={notice ? "mt-3 text-[0.9375rem] font-semibold text-[var(--forest)]" : "sr-only"}>
          {notice ?? ""}
        </p>
        {body}
      </section>

      {list.status === "ready" ? (
        <section aria-labelledby="past" className="min-w-0">
          <div className="mb-2 border-t border-[var(--ink)] pt-5">
            <SectionTitle id="past">Past</SectionTitle>
          </div>
          {past.length ? (
            <ul className="m-0 list-none p-0">
              {past.map((b) => (
                <VisitRow key={b.id} muted startsAt={b.start_at} title={title(b)} meta={meta(b)} state={b.state} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[var(--ink-soft)]">No past visits.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Two-step cancel: the first press asks, the second sends POST /api/bookings/{id}/cancel with the row's version. */
function CancelControl({ booking, label, onDone }: { booking: Booking; label: string; onDone: (message: string | null) => void }) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // Keep keyboard focus on the control when it swaps between "Cancel" and the confirm buttons.
  useEffect(() => {
    if (!moved.current) return;
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [asking]);

  const ask = (value: boolean) => {
    moved.current = true;
    setAsking(value);
  };

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/bookings/${booking.id}/cancel`, {
        method: "POST",
        auth: true,
        body: { expectedVersion: booking.version, reason: "patient_request" },
      });
      onDone(`Request ${booking.public_ref} was cancelled.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onDone(`Request ${booking.public_ref} has changed or can no longer be cancelled online. The list has been refreshed.`);
      } else {
        setError(errorMessage(e));
        setPending(false);
      }
    }
  }

  if (!asking) {
    return (
      <div ref={box}>
        <Button variant="secondary" onClick={() => ask(true)} aria-label={`Cancel request: ${label}, ${formatSlot(booking.start_at)}`}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div ref={box} className="flex w-full flex-col gap-2 sm:w-56">
      <p className="text-[0.9375rem] font-semibold">Cancel this request?</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void cancel()} loading={pending}>
          Yes, cancel
        </Button>
        <Button variant="secondary" onClick={() => ask(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
