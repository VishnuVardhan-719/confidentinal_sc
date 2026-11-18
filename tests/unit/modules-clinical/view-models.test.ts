import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import {
  addTestOrReferral,
  defaultKeyFactory,
  emptyMedicineLine,
  isStepId,
  removeTestOrReferral,
  setFollowUp,
  updateStep,
} from "@/modules/clinical/editor";
import { gateMethods } from "@/modules/clinical/gate";
import { idSegment } from "@/modules/clinical/http-util";
import { allergyFacts, loadConsultationWorkspace } from "@/modules/clinical/loaders";
import { emptyDraftContent, medicineLineSchema, testOrReferralSchema } from "@/modules/clinical/schemas";
import { describeAssessmentType, describeConsultationStatus, describeDraftStatus } from "@/modules/clinical/status";
import { UNKNOWN_STATUS } from "@/modules/clinical/status-core";
import { draftReducer, hasUnsavedWork, initDraftState } from "@/modules/clinical/draft-machine";
import type { DoctorApi } from "@/modules/doctor/api";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { interpretCommand, loadDoctorDashboard, loadVisits } from "@/modules/doctor/loaders";
import { OTP_ERROR_CODES } from "@/modules/doctor/types";
import { OTP_ERROR_LABEL_KEYS, otpErrorFromOutcome } from "@/modules/doctor/otp";
import { doctorPaths, isDoctorLocale } from "@/modules/doctor/routing";
import {
  BOOKING_STATE_MAP,
  describeBookingState,
  describeChallengePhase,
  describeChallengeStatus,
  describeVisitPhase,
  DECLINE_REASON_LABEL_KEYS,
} from "@/modules/doctor/status";
import { allowedVisitActions, istDate } from "@/modules/doctor/visit";
import { createRecordsFixtureApi } from "@/modules/records/fixture";
import {
  describeCollectionStatus,
  describeFactBadge,
  describePdfLinkState,
  describePhotoConsent,
  describePhotoScan,
  describeProofState,
} from "@/modules/records/status";
import { isDoctorVerified } from "@/modules/records/logic";

const T0 = new Date("2026-11-20T04:30:00.000Z");
const ON = { FEATURE_CLINICAL: "true" };

describe("status maps", () => {
  const describers = [
    describeBookingState,
    describeVisitPhase,
    describeChallengeStatus,
    describeChallengePhase,
    describeDraftStatus,
    describeConsultationStatus,
    describeAssessmentType,
    describeCollectionStatus,
    describeFactBadge,
    describeProofState,
    describePhotoConsent,
    describePhotoScan,
    describePdfLinkState,
  ];

  it("unknown, null and prototype keys map to the neutral unknown status", () => {
    for (const d of describers) {
      for (const v of ["nope", null, undefined, "__proto__", "toString", "constructor", ""]) expect(d(v)).toEqual(UNKNOWN_STATUS);
    }
  });

  it("terminal negative booking states never look successful", () => {
    for (const s of ["declined", "expired", "cancelled", "no_show", "interrupted"] as const) expect(BOOKING_STATE_MAP[s].tone).not.toBe("success");
  });

  it("every OTP error and decline reason has a message key", () => {
    for (const c of OTP_ERROR_CODES) expect(OTP_ERROR_LABEL_KEYS[c]).toMatch(/^doctor\.arrival\.error\./);
    expect(Object.values(DECLINE_REASON_LABEL_KEYS).every((k) => k.startsWith("doctor.requests.decline.reason."))).toBe(true);
  });
});

describe("otp outcome mapping", () => {
  it("verified has no error; rejected maps to its reason", () => {
    expect(otpErrorFromOutcome({ result: "verified", bookingVersion: 2, verifiedAt: T0.toISOString() })).toBeNull();
    const challenge = { bookingId: "b", challengeId: "c", status: "active" as const, issuedAt: T0.toISOString(), expiresAt: T0.toISOString(), attemptsRemaining: 1, maxAttempts: 5, resendsRemaining: 0, resendAvailableAt: null };
    expect(otpErrorFromOutcome({ result: "rejected", reason: "replayed", challenge })).toBe("replayed");
  });
});

describe("routing paths", () => {
  it("builds encoded doctor paths and validates locales", () => {
    const p = doctorPaths("hi");
    expect(p.consultation("abc-1")).toBe("/hi/doctor/visits/abc-1/consultation");
    expect(p.visit("a/b")).toBe("/hi/doctor/visits/a%2Fb");
    expect(isDoctorLocale("te")).toBe(true);
    expect(isDoctorLocale("fr")).toBe(false);
  });

  it("idSegment refuses path-shaped input", () => {
    expect(idSegment("abc-123")).toBe("abc-123");
    for (const bad of ["../x", "a/b", "a?b=1", "", "a".repeat(65), "a b"]) expect(idSegment(bad)).toBeNull();
  });
});

describe("visit actions across phases", () => {
  it("derives exactly one next action per phase and none when unauthorized states", () => {
    const base = { state: "confirmed" as const, consultationId: null };
    expect(allowedVisitActions({ ...base, phase: "en_route" })).toEqual(["arrive"]);
    expect(allowedVisitActions({ ...base, phase: "arrived" })).toEqual(["verify_arrival"]);
    expect(allowedVisitActions({ ...base, phase: "arrival_verified" })).toEqual(["start_consultation"]);
    expect(allowedVisitActions({ state: "in_progress", phase: "service_started", consultationId: "c" })).toEqual(["open_consultation"]);
    expect(allowedVisitActions({ state: "in_progress", phase: "service_started", consultationId: null })).toEqual([]);
    expect(allowedVisitActions({ state: "requested", phase: "scheduled", consultationId: null })).toEqual([]);
  });

  it("istDate uses Asia/Kolkata (UTC evening is next IST day)", () => {
    expect(istDate(new Date("2026-11-20T19:00:00.000Z"))).toBe("2026-11-21");
  });
});

describe("doctor loaders: failure isolation and visits", () => {
  it("visits outage marks visit sections errored but keeps requests", async () => {
    const real = createDoctorFixtureApi({ world: createClinicalWorld(T0), now: () => T0, actor: { role: "doctor", doctorId: I.doctorAssigned } });
    const broken: DoctorApi = { ...real, listVisits: async () => ({ ok: false, error: { code: "unavailable" } }) };
    const d = await loadDoctorDashboard(broken, T0);
    expect(d.requests.kind).toBe("ready");
    expect(d.today).toEqual({ kind: "error", code: "unavailable", retryable: true });
    expect(d.active).toBeNull();
  });

  it("loadVisits returns split lists, empty for other doctor, gated over http", async () => {
    const world = createClinicalWorld(T0);
    const mine = await loadVisits(createDoctorFixtureApi({ world, now: () => T0, actor: { role: "doctor", doctorId: I.doctorAssigned } }), T0);
    expect(mine.kind === "ready" && [mine.data.today.length, mine.data.upcoming.length]).toEqual([2, 1]);
    const other = await loadVisits(createDoctorFixtureApi({ world, now: () => T0, actor: { role: "doctor", doctorId: I.doctorOther } }), T0);
    expect(other.kind).toBe("empty");
    const gated: DoctorApi = { ...createDoctorFixtureApi({ world, actor: { role: "doctor", doctorId: I.doctorAssigned } }), listVisits: async () => ({ ok: false, error: { code: "gated" } }) };
    expect(await loadVisits(gated, T0)).toEqual({ kind: "gated" });
  });

  it("interpretCommand covers every error code", () => {
    const k = (code: Parameters<typeof interpretCommand>[0] extends infer R ? (R extends { ok: false; error: { code: infer C } } ? C : never) : never) =>
      interpretCommand({ ok: false, error: { code } }, "arrive").kind;
    expect(k("unauthenticated")).toBe("signin");
    expect(k("forbidden")).toBe("denied");
    expect(k("not_found")).toBe("denied");
    expect(k("conflict")).toBe("refresh");
    expect(k("validation")).toBe("invalid");
    expect(k("rate_limited")).toBe("retry");
    expect(k("unavailable")).toBe("retry");
    expect(k("gated")).toBe("gated");
  });
});

describe("consultation workspace loader edge cases", () => {
  const deps = (world = createClinicalWorld(T0)) => {
    const now = () => T0;
    return { world, doctor: createDoctorFixtureApi({ world, now, actor: { role: "doctor", doctorId: I.doctorAssigned } }), clinical: createClinicalFixtureApi({ world, now, actor: { role: "doctor", doctorId: I.doctorAssigned } }), records: createRecordsFixtureApi({ world, now, actor: { role: "doctor", doctorId: I.doctorAssigned } }) };
  };

  it("facts outage leaves the editor usable with an 'unknown' allergy banner", async () => {
    const d = deps();
    const r = await loadConsultationWorkspace({ ...d, records: { ...d.records, listHealthFacts: async () => ({ ok: false, error: { code: "unavailable" } }) }, env: ON }, I.bookingActive);
    expect(r.kind === "ready" && r.data.mode === "editor" && r.data.allergies).toEqual({ kind: "unknown" });
    expect(r.kind === "ready" && r.data.mode === "editor" && r.data.healthFacts.kind).toBe("error");
  });

  it("signed consultation loads in read-only signed mode", async () => {
    const r = await loadConsultationWorkspace({ ...deps(), env: ON }, I.bookingPast);
    expect(r.kind === "ready" && r.data.mode).toBe("signed");
  });

  it("draft on a visit that is no longer in consultation is not writable", async () => {
    const d = deps();
    d.world.bookings.get(I.bookingActive)!.state = "interrupted";
    const r = await loadConsultationWorkspace({ ...d, env: ON }, I.bookingActive);
    expect(r.kind === "ready" && r.data.mode === "editor" && r.data.writable).toBe(false);
  });

  it("allergyFacts keeps only allergies and marks verification honestly", () => {
    const v = (source: "patient_entered" | "doctor_verified", withVerifier: boolean) => ({ version: 1, value: "Synthetic", source, recordedAt: T0.toISOString(), verifier: withVerifier ? { clinicianId: "d", displayName: "Dr" } : null, evidenceNote: withVerifier ? "Reviewed" : null });
    const facts = [
      { factId: "1", kind: "allergy" as const, current: v("doctor_verified", true), history: [] },
      { factId: "2", kind: "allergy" as const, current: v("doctor_verified", false), history: [] },
      { factId: "3", kind: "blood_group" as const, current: v("patient_entered", false), history: [] },
    ];
    expect(allergyFacts(facts)).toEqual([{ value: "Synthetic", verified: true }, { value: "Synthetic", verified: false }]);
    expect(isDoctorVerified({ ...v("doctor_verified", true), evidenceNote: "  " })).toBe(false);
  });
});

describe("editor helpers", () => {
  it("default row keys satisfy the schema row-key format", () => {
    for (let i = 0; i < 20; i++) {
      const key = defaultKeyFactory();
      expect(medicineLineSchema.safeParse({ ...emptyMedicineLine(key), name: "x" }).success).toBe(true);
      expect(testOrReferralSchema.safeParse({ key, kind: "test", description: "x" }).success).toBe(true);
    }
  });

  it("updateStep, tests/referrals and follow-up helpers are pure", () => {
    const c = emptyDraftContent();
    const next = updateStep(c, "care", setFollowUp(c.care, { mode: "recommended", date: "2026-11-27" }));
    expect(c.care).toEqual({});
    expect(next.care.followUp).toEqual({ mode: "recommended", date: "2026-11-27" });
    const p = addTestOrReferral(c.prescription, { key: "t1", kind: "referral", description: "Synthetic referral" });
    expect(c.prescription.testsAndReferrals).toBeUndefined();
    expect(removeTestOrReferral(p, "t1").testsAndReferrals).toEqual([]);
    expect(isStepId("review")).toBe(true);
    expect(isStepId("sign")).toBe(false);
  });

  it("hasUnsavedWork drives the leave warning", () => {
    const s = initDraftState({ consultationId: "c", content: emptyDraftContent(), version: 1, savedAt: null });
    expect(hasUnsavedWork(s)).toBe(false);
    const edited = draftReducer(s, { type: "edit", content: { ...s.content, care: { advice: "x" } } });
    expect(hasUnsavedWork(edited)).toBe(true);
    expect(hasUnsavedWork(draftReducer(edited, { type: "finalized" }))).toBe(false);
  });
});

describe("gateMethods", () => {
  it("does not mutate the adapter and passes ungated methods through", async () => {
    const api = { a: async () => ({ ok: true as const, data: 1 }), b: async () => ({ ok: true as const, data: 2 }) };
    const gated = gateMethods(api, ["a"], {});
    expect(await gated.a()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await gated.b()).toEqual({ ok: true, data: 2 });
    expect(await api.a()).toEqual({ ok: true, data: 1 });
    expect(gateMethods(api, ["a"], ON)).toBe(api);
  });
});
