import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { cancelBookingAction, requestRescheduleAction } from "@/app/[locale]/patient/bookings/actions";
import {
  bookingBadges,
  bookingDetailPath,
  canAskToReschedule,
  patientCancelState,
  paymentFor,
  providerDecision,
  timelineEntries,
} from "@/components/patient/booking-detail-logic";
import { BOOKINGS_PAGE_SIZE, bookingsHref, filterBookings, filterCounts, parseBookingsQuery } from "@/components/patient/bookings-query";
import { checkReschedule, rescheduleRequestSchema } from "@/components/patient/reschedule-request";
import { permittedActions } from "@/modules/bookings/actions";
import type { BookingEvent } from "@/modules/bookings/schemas";
import { patientLoginRedirect } from "@/modules/patient-dashboard/session";

const ID = "00000000-0000-4000-8000-000000000061";
const OTHER = "00000000-0000-4000-8000-000000000099";

describe("bookings list query", () => {
  it("accepts known filters and a uuid cursor, lower-cased", () => {
    expect(parseBookingsQuery({ status: "past", cursor: ID.toUpperCase() })).toEqual({ filter: "past", cursor: ID });
    expect(parseBookingsQuery({ status: ["cancelled", "past"] })).toEqual({ filter: "cancelled" });
  });

  it("drops unknown filters and malformed cursors instead of passing them on", () => {
    expect(parseBookingsQuery({ status: "PAID", cursor: "1 OR 1=1" })).toEqual({ filter: "all" });
    expect(parseBookingsQuery({})).toEqual({ filter: "all" });
  });

  it("builds short locale-less hrefs", () => {
    expect(bookingsHref({ filter: "all" })).toBe("/patient/bookings");
    expect(bookingsHref({ filter: "upcoming", cursor: ID })).toBe(`/patient/bookings?status=upcoming&cursor=${ID}`);
    expect(BOOKINGS_PAGE_SIZE).toBeGreaterThan(0);
  });

  it("filters and counts the loaded page groups without mutating them", () => {
    const groups = { upcoming: ["u1", "u2"], past: ["p1"], cancelled: ["c1"] };
    expect(filterBookings(groups, "all")).toEqual(["u1", "u2", "p1", "c1"]);
    expect(filterBookings(groups, "past")).toEqual(["p1"]);
    const copy = filterBookings(groups, "upcoming");
    copy.push("x");
    expect(groups.upcoming).toEqual(["u1", "u2"]);
    expect(filterCounts(groups)).toEqual({ all: 4, upcoming: 2, past: 1, cancelled: 1 });
  });
});

describe("booking detail logic", () => {
  it("shows the provider decision read-only from the booking state", () => {
    expect(providerDecision("REQUESTED")).toEqual({ labelKey: "patient.booking.decision.waiting", tone: "progress" });
    expect(providerDecision("CONFIRMED").labelKey).toBe("patient.booking.decision.accepted");
    expect(providerDecision("DECLINED").labelKey).toBe("patient.booking.decision.declined");
    expect(providerDecision("SOMETHING_NEW")).toEqual({ labelKey: "patient.booking.decision.unknown", tone: "neutral" });
  });

  it("offers a cancel request only for the patient on an active booking", () => {
    const requested = patientCancelState(permittedActions({ status: "REQUESTED", category: "doctor" }, "patient"), "REQUESTED");
    expect(requested).toEqual({ kind: "request", policyApplies: false });
    const confirmed = patientCancelState(permittedActions({ status: "CONFIRMED", category: "doctor" }, "patient"), "CONFIRMED");
    expect(confirmed).toEqual({ kind: "request", policyApplies: true });
    const granted = permittedActions({ status: "ACCEPTED", category: "doctor", serverAllowedActions: ["cancel"] }, "patient");
    expect(patientCancelState(granted, "ACCEPTED")).toEqual({ kind: "available", policyApplies: true });
    for (const status of ["COMPLETED", "CANCELLED", "DECLINED", "IN_PROGRESS", "NOT_A_STATE"]) {
      expect(patientCancelState(permittedActions({ status, category: "doctor" }, "patient"), status)).toEqual({ kind: "closed" });
    }
    expect(patientCancelState([], "REQUESTED")).toEqual({ kind: "closed" });
  });

  it("allows asking to reschedule only before the visit starts", () => {
    expect(["REQUESTED", "ACCEPTED", "CONFIRMED"].every(canAskToReschedule)).toBe(true);
    expect(["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"].some(canAskToReschedule)).toBe(false);
  });

  it("orders the timeline oldest first with a stable version tie-break", () => {
    const ev = (id: string, at: string, version: number, actorRole: BookingEvent["actorRole"]): BookingEvent => ({
      id, bookingId: ID, status: "REQUESTED", version, occurredAt: at, actorRole, synthetic: true,
    });
    const items = [
      ev("00000000-0000-4000-8000-0000000000e3", "2026-11-20T05:00:00.000Z", 4, "provider"),
      ev("00000000-0000-4000-8000-0000000000e2", "2026-11-20T04:00:00.000Z", 3, "system"),
      ev("00000000-0000-4000-8000-0000000000e1", "2026-11-20T04:00:00.000Z", 2, "patient"),
    ];
    const out = timelineEntries(items);
    expect(out.map((e) => e.version)).toEqual([2, 3, 4]);
    expect(out[0]).toMatchObject({ statusLabelKey: "booking.status.requested", actorLabelKey: "patient.booking.timeline.actor.you" });
    expect(out[2]?.actorLabelKey).toBe("patient.booking.timeline.actor.provider");
  });

  it("shows a payment summary only when it is valid and for this booking", () => {
    const summary = { bookingId: ID, status: "DUE", currency: "INR", amountDuePaise: 50000, collectedPaise: 0, refundedPaise: 0, method: "pay_after", version: 1, synthetic: true };
    expect(paymentFor(ok(summary), ID)?.amountDuePaise).toBe(50000);
    expect(paymentFor(ok({ ...summary, bookingId: OTHER }), ID)).toBeNull();
    expect(paymentFor(ok({ ...summary, amountDuePaise: 500.5 }), ID)).toBeNull();
    expect(paymentFor(fail("gated"), ID)).toBeNull();
  });

  it("keeps booking, payment and clinical badges independent", () => {
    const card = { id: ID, status: "COMPLETED", operationalStatus: null, reference: "SCV-1" };
    const b = bookingBadges(card, fail("unavailable"), fail("gated"));
    expect(b.booking.labelKey).toBe("booking.status.completed");
    expect(b.visit).toBeNull();
    expect(b.payment.labelKey).toBe("patient.dashboard.payment.unavailable");
    expect(b.clinical.labelKey).toBe("patient.dashboard.clinical.off");
    const paid = bookingBadges({ ...card, operationalStatus: "EN_ROUTE" }, ok({ bookingId: ID, status: "PAID", currency: "INR", amountDuePaise: 0,
      collectedPaise: 50000, refundedPaise: 0, method: "pay_after", version: 2, synthetic: true }), ok([]));
    expect(paid.payment.labelKey).toBe("patient.dashboard.payment.paid");
    expect(paid.visit?.labelKey).toBe("booking.status.enRoute");
    expect(paid.clinical.labelKey).toBe("patient.dashboard.clinical.none");
  });

  it("builds a login return path that the interim guard accepts", () => {
    expect(patientLoginRedirect("te", bookingDetailPath("te", ID))).toBe(`/te/login?next=${encodeURIComponent(`/te/patient/bookings/${ID}`)}`);
    expect(patientLoginRedirect("en", bookingDetailPath("en", null))).toBe(`/en/login?next=${encodeURIComponent("/en/patient/bookings")}`);
  });
});

describe("reschedule request", () => {
  const now = "2026-11-18T10:00:00.000Z";
  it("converts an India wall time to UTC and rejects the past", () => {
    expect(checkReschedule({ date: "2026-11-20", time: "10:30" }, now)).toEqual({ ok: true, startAt: "2026-11-20T05:00:00.000Z" });
    expect(checkReschedule({ date: "2026-11-18", time: "15:00" }, now)).toEqual({ ok: false, error: "past" });
    expect(checkReschedule({ date: "20-11-2026", time: "10:30" }, now)).toEqual({ ok: false, error: "date" });
    expect(checkReschedule({ date: "2026-11-20", time: "25:00" }, now)).toEqual({ ok: false, error: "time" });
  });
  it("accepts no extra fields (no free text, no price)", () => {
    const base = { bookingId: ID, expectedVersion: 2, date: "2026-11-20", time: "10:30" };
    expect(rescheduleRequestSchema.safeParse(base).success).toBe(true);
    expect(rescheduleRequestSchema.safeParse({ ...base, note: "x" }).success).toBe(false);
    expect(rescheduleRequestSchema.safeParse({ ...base, expectedVersion: 0 }).success).toBe(false);
  });
});

describe("patient booking server actions (fixture adapter)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const fixtureEnv = (session: boolean) => {
    vi.stubEnv("FRONTEND_ADAPTER", "fixture");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("FIXTURE_BOOKING_SCENARIO", "requested");
    vi.stubEnv("FIXTURE_PATIENT_SESSION", session ? "self" : "");
  };

  it("validates ids and versions before checking anything else", async () => {
    fixtureEnv(true);
    expect(await cancelBookingAction("not-a-uuid", 2)).toEqual(fail("validation"));
    expect(await cancelBookingAction(ID, 0)).toEqual(fail("validation"));
  });

  it("refuses without a patient session", async () => {
    fixtureEnv(false);
    expect(await cancelBookingAction(ID, 2)).toEqual(fail("unauthenticated"));
    expect(await requestRescheduleAction({ bookingId: ID, expectedVersion: 2, date: "2099-01-01", time: "10:00" })).toEqual(fail("unauthenticated"));
  });

  it("cancels with the version the patient saw and reports a stale version as conflict", async () => {
    fixtureEnv(true);
    expect(await cancelBookingAction(ID, 2)).toEqual(ok({ version: 3 }));
    expect(await cancelBookingAction(ID, 1)).toEqual(fail("conflict"));
    expect(await cancelBookingAction(OTHER, 2)).toEqual(fail("not_found"));
  });

  it("reschedule fails closed as gated (no backend contract) after validating", async () => {
    fixtureEnv(true);
    expect(await requestRescheduleAction({ bookingId: ID, expectedVersion: 2, date: "2099-01-01", time: "10:00" })).toEqual(fail("gated"));
    expect(await requestRescheduleAction({ bookingId: ID, expectedVersion: 2, date: "2000-01-01", time: "10:00" })).toEqual(fail("validation"));
    expect(await requestRescheduleAction({ bookingId: ID, expectedVersion: 2, date: "2099-01-01", time: "10:00", price: 1 })).toEqual(fail("validation"));
  });
});
