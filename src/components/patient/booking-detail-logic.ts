import type { ApiResult } from "@/lib/api/result";
import type { ActionAvailability } from "@/modules/bookings/actions";
import type { BookingEvent, BookingStatus } from "@/modules/bookings/schemas";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import type { StatusDescriptor } from "@/modules/clinical/status-core";
import { clinicalBadge, PAYMENT_UNAVAILABLE, paymentBadge } from "@/modules/patient-dashboard/loader";
import { paymentSummarySchema, type PaymentSummary } from "@/modules/payments/schemas";
import type { PatientRecordSummary } from "@/modules/records/types";

const B = "patient.booking";

/**
 * Accept/decline belongs to the provider. The patient only sees where that decision stands; it is
 * read from the booking state and never offered as a patient action.
 */
export function providerDecision(status: BookingStatus | string): StatusDescriptor {
  switch (status) {
    case "DRAFT":
      return { labelKey: `${B}.decision.notSent`, tone: "neutral" };
    case "REQUESTED":
      return { labelKey: `${B}.decision.waiting`, tone: "progress" };
    case "ACCEPTED":
    case "CONFIRMED":
    case "IN_PROGRESS":
    case "COMPLETED":
    case "INTERRUPTED":
    case "NO_SHOW":
      return { labelKey: `${B}.decision.accepted`, tone: "success" };
    case "DECLINED":
      return { labelKey: `${B}.decision.declined`, tone: "warning" };
    case "EXPIRED":
      return { labelKey: `${B}.decision.expired`, tone: "neutral" };
    case "CANCELLED":
      return { labelKey: `${B}.decision.cancelled`, tone: "neutral" };
    default:
      return { labelKey: `${B}.decision.unknown`, tone: "neutral" };
  }
}

export type CancelState =
  /** The server granted cancel for this booking. */
  | { kind: "available"; policyApplies: boolean }
  /** Right actor and state, but no server grant was reported: the patient may send the request and the server decides. */
  | { kind: "request"; policyApplies: boolean }
  | { kind: "closed" };

/** Derived from permittedActions(); a wrong actor or an inactive state is never offered. */
export function patientCancelState(actions: readonly ActionAvailability[], status: string): CancelState {
  const cancel = actions.find((a) => a.action === "cancel");
  const policyApplies = status === "ACCEPTED" || status === "CONFIRMED";
  if (!cancel) return { kind: "closed" };
  if (cancel.enabled) return { kind: "available", policyApplies };
  if (cancel.disabledReasonKey === "booking.action.authorizationRequired") return { kind: "request", policyApplies };
  return { kind: "closed" };
}

/** Reschedule is only meaningful before the visit starts. There is no reschedule API yet (gated). */
export function canAskToReschedule(status: string): boolean {
  return status === "REQUESTED" || status === "ACCEPTED" || status === "CONFIRMED";
}

const ACTOR_KEYS = { patient: "you", provider: "provider", assigned: "assigned", system: "system" } as const;

export type TimelineEntry = { id: string; statusLabelKey: string; actorLabelKey: string; occurredAt: string; version: number };

/** Oldest first; ties broken by version so replays render in a stable order. */
export function timelineEntries(events: readonly BookingEvent[]): TimelineEntry[] {
  return [...events]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.version - b.version)
    .map((e) => ({
      id: e.id,
      statusLabelKey: bookingStatusPresentation(e.status).labelKey,
      actorLabelKey: `${B}.timeline.actor.${ACTOR_KEYS[e.actorRole] ?? "system"}`,
      occurredAt: e.occurredAt,
      version: e.version,
    }));
}

/** A payment summary is shown only if it validates and belongs to this booking. */
export function paymentFor(result: ApiResult<unknown>, bookingId: string): PaymentSummary | null {
  if (!result.ok) return null;
  const parsed = paymentSummarySchema.safeParse(result.data);
  return parsed.success && parsed.data.bookingId === bookingId ? parsed.data : null;
}

export type BookingBadges = { booking: StatusDescriptor; visit: StatusDescriptor | null; payment: StatusDescriptor; clinical: StatusDescriptor };

/** Booking, visit, payment and clinical states are independent; none is inferred from another. */
export function bookingBadges(
  b: { id: string; status: string; operationalStatus: string | null; reference: string | null },
  payment: ApiResult<unknown>,
  records: ApiResult<PatientRecordSummary[]>,
): BookingBadges {
  const summary = paymentFor(payment, b.id);
  return {
    booking: bookingStatusPresentation(b.status),
    visit: b.operationalStatus ? bookingStatusPresentation(b.operationalStatus) : null,
    payment: summary ? paymentBadge(summary.status) : PAYMENT_UNAVAILABLE,
    clinical: clinicalBadge(records, b.reference),
  };
}

/** Login return path for the detail page; only a validated id is ever put in it. */
export function bookingDetailPath(locale: string, id: string | null): string {
  return id ? `/${locale}/patient/bookings/${id}` : `/${locale}/patient/bookings`;
}
