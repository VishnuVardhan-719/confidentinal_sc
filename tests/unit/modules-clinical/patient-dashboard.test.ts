import { describe, expect, it } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { createBookingsApi } from "@/modules/bookings/api";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import { createPatientApi } from "@/modules/patient/api";
import { createPaymentsApi } from "@/modules/payments/api";
import { getRecordsApi } from "@/modules/records";
import {
  CLINICAL_NONE,
  CLINICAL_OFF,
  CLINICAL_SIGNED,
  CLINICAL_UNKNOWN,
  clinicalBadge,
  loadPatientDashboard,
  loadProfilePrompt,
  MAX_DASHBOARD_BOOKINGS,
  PAYMENT_UNAVAILABLE,
  paymentBadge,
  type PatientDashboardDeps,
} from "@/modules/patient-dashboard/loader";
import { authorizerFor, dashboardBookingsApi, getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import type { PatientRecordSummary } from "@/modules/records/types";

// Synthetic data - not live.
const ENV = { FRONTEND_ADAPTER: "fixture", FIXTURE_PATIENT_SESSION: "self", FIXTURE_BOOKING_SCENARIO: "accepted" };
const NOW = new Date("2026-11-18T04:30:00.000Z");

function deps(env: Record<string, string | undefined> = ENV, over: Partial<PatientDashboardDeps> = {}): PatientDashboardDeps {
  const s = getPatientSession(env);
  return {
    authorizePatient: authorizerFor(env),
    bookings: dashboardBookingsApi(env),
    payments: createPaymentsApi(env),
    patient: createPatientApi(env),
    records: getRecordsApi(env, { fixtureActor: s.status === "ok" ? s.fixtureActor ?? undefined : undefined }),
    ...over,
  };
}

const record = (bookingReference: string): PatientRecordSummary => ({
  consultationId: "syn-c-1",
  bookingReference,
  visitAt: NOW.toISOString(),
  doctorDisplayName: "Synthetic Doctor",
  currentVersion: 1,
  lastSignedAt: NOW.toISOString(),
  amended: false,
});

describe("patient dashboard: three independent badges", () => {
  it("fixture upcoming bookings carry separate booking, payment and clinical badges", async () => {
    const d = await loadPatientDashboard(deps(), "en", NOW);
    expect(d.upcoming.kind).toBe("ready");
    if (d.upcoming.kind !== "ready") return;
    expect(d.upcoming.data.length).toBeGreaterThan(0);
    expect(d.upcoming.data.length).toBeLessThanOrEqual(MAX_DASHBOARD_BOOKINGS);
    for (const b of d.upcoming.data) {
      expect(b.synthetic).toBe(true);
      expect(b.booking.labelKey).toMatch(/^booking\.status\./);
      expect(b.payment.labelKey).toMatch(/^patient\.dashboard\.payment\./);
      // Clinical flag is off by default: honest "off", never "no record" or "signed".
      expect(b.clinical).toEqual(CLINICAL_OFF);
      expect(b.href).toBe(`/en/patient/bookings/${b.id}`);
    }
  });

  it("a payment summary for another booking, or a thrown call, is shown as unavailable", async () => {
    const otherId = "00000000-0000-4000-8000-00000000ffff";
    const wrong = await loadPatientDashboard(
      deps(ENV, {
        payments: {
          getSummary: async () =>
            ok({ bookingId: otherId, status: "PAID", currency: "INR", amountDuePaise: 0, collectedPaise: 0, refundedPaise: 0, method: null, version: 1, synthetic: true }),
        },
      }),
      "en",
      NOW,
    );
    if (wrong.upcoming.kind !== "ready") throw new Error("expected ready");
    expect(wrong.upcoming.data.every((b) => b.payment === PAYMENT_UNAVAILABLE)).toBe(true);
    const thrown = await loadPatientDashboard(deps(ENV, { payments: { getSummary: async () => { throw new Error("net"); } } }), "en", NOW);
    if (thrown.upcoming.kind !== "ready") throw new Error("expected ready");
    expect(thrown.upcoming.data.every((b) => b.payment === PAYMENT_UNAVAILABLE)).toBe(true);
  });

  it("booking status never implies payment: an unknown payment status is neutral", () => {
    expect(paymentBadge("PAID")).toEqual({ labelKey: "patient.dashboard.payment.paid", tone: "success" });
    expect(paymentBadge("SOMETHING_NEW")).toEqual({ labelKey: "patient.dashboard.payment.unknown", tone: "neutral" });
  });

  it("clinical badge: gated -> off, error -> unknown, matched reference -> signed, else none", () => {
    expect(clinicalBadge(fail("gated"), "SCV-1")).toEqual(CLINICAL_OFF);
    expect(clinicalBadge(fail("unavailable"), "SCV-1")).toEqual(CLINICAL_UNKNOWN);
    expect(clinicalBadge(ok([record("SCV-1")]), "SCV-1")).toEqual(CLINICAL_SIGNED);
    expect(clinicalBadge(ok([record("SCV-2")]), "SCV-1")).toEqual(CLINICAL_NONE);
    expect(clinicalBadge(ok([record("SCV-1")]), null)).toEqual(CLINICAL_UNKNOWN);
  });

  it("an unauthorized patient gets no bookings (unauthenticated state)", async () => {
    const d = await loadPatientDashboard(deps(ENV, { authorizePatient: async () => fail("unauthenticated") }), "en", NOW);
    expect(d.upcoming).toEqual({ kind: "unauthenticated" });
  });

  it("no upcoming bookings renders the empty state", async () => {
    const d = await loadPatientDashboard(deps(ENV, { bookings: { ...createBookingsApi(ENV), list: async () => ok({ items: [] }) } }), "en", NOW);
    expect(d.upcoming).toEqual({ kind: "empty" });
  });
});

describe("patient dashboard: profile completeness prompt", () => {
  it("incomplete required items are listed with jump links", async () => {
    const p = await loadProfilePrompt(createPatientFixtureApi({ env: ENV, scenario: "questionnaire_incomplete" }));
    expect(p.kind).toBe("incomplete");
    if (p.kind !== "incomplete") return;
    expect(p.done).toBeLessThan(p.total);
    expect(p.missing.map((m) => m.key)).toEqual(expect.arrayContaining(["pinnedLocation", "allergies"]));
    expect(p.missing.find((m) => m.key === "allergies")?.href).toBe("/patient/health-profile#field-allergies");
  });

  it("http mode (no contract) is unknown, never complete", async () => {
    expect(await loadProfilePrompt(createPatientApi({ FRONTEND_ADAPTER: "http" }))).toEqual({ kind: "unknown" });
  });

  it("an empty required list is unknown, not complete", async () => {
    const api = { getOverview: async () => ok({ questionnaire: "complete" as const, completion: [], synthetic: true }) };
    expect(await loadProfilePrompt(api)).toEqual({ kind: "unknown" });
  });
});

describe("patient dashboard: interim session", () => {
  it("fails closed outside an explicit fixture session", () => {
    expect(getPatientSession({ FRONTEND_ADAPTER: "http" })).toEqual({ status: "unauthenticated" });
    expect(getPatientSession({ FRONTEND_ADAPTER: "fixture" })).toEqual({ status: "unauthenticated" });
    expect(() => getPatientSession({ ...ENV, APP_ENV: "production" })).toThrow();
    expect(getPatientSession(ENV).status).toBe("ok");
  });

  it("login redirect keeps only safe patient paths in next", () => {
    expect(patientLoginRedirect("te", "/te/patient/dashboard")).toBe("/te/login?next=%2Fte%2Fpatient%2Fdashboard");
    expect(patientLoginRedirect("xx", "//evil.example")).toBe("/en/login?next=%2Fen%2Fpatient%2Fdashboard");
  });
});
