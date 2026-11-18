import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureAuthApi, createFixtureChallengeStore } from "@/modules/auth/fixture";
import { assertFixtureAllowed } from "@/modules/auth/fixture-guard";
import { createHttpAuthApi } from "@/modules/auth/http";
import { parseRetryAfter, type FetchLike } from "@/modules/auth/http-client";
import { landingPathFor } from "@/modules/auth/routes";
import type { Identity } from "@/modules/auth/types";
import { createFixtureOnboardingApi, createFixtureOnboardingStore } from "@/modules/onboarding/fixture";
import { createFixtureVerificationApi, createFixtureVerificationStore } from "@/modules/verification/fixture";
import { FIXTURE_IDS, FIXTURE_OTP_CODE } from "@/fixtures/identity";

/** Regression tests for CodeRabbit findings on the phase 1 commit (CR-fixes-B). */

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const PHONE = "+916000000000";
const signupInput = { method: "phone_otp", role: "patient", phone: PHONE, acceptedTerms: true, termsVersion: "v" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fixture guard", () => {
  it("process APP_ENV=production wins over an injected env without APP_ENV", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(() => assertFixtureAllowed({})).toThrow(/not allowed/);
    expect(() => createFixtureAuthApi({ env: { FRONTEND_ADAPTER: "fixture" } })).toThrow();
  });
});

describe("fixture OTP", () => {
  it("sign-out invalidates pending challenges", async () => {
    const api = createFixtureAuthApi({ env: DEV, challengeStore: createFixtureChallengeStore() });
    const r = await api.login({ method: "phone_otp", phone: PHONE });
    if (!r.ok || r.data.kind !== "otp_challenge") throw new Error("expected challenge");
    await api.logout();
    expect((await api.verifyOtp({ challengeId: r.data.challenge.challengeId, code: FIXTURE_OTP_CODE })).ok).toBe(false);
    expect(await api.getSession()).toEqual({ ok: true, data: { kind: "anonymous" } });
  });

  it("OTP login resolves to the identity that signed up with that phone", async () => {
    const store = createFixtureChallengeStore();
    const signupApi = createFixtureAuthApi({ env: DEV, challengeStore: store });
    const s = await signupApi.signup(signupInput);
    if (!s.ok || s.data.kind !== "otp_challenge") throw new Error("expected challenge");
    await signupApi.verifyOtp({ challengeId: s.data.challenge.challengeId, code: FIXTURE_OTP_CODE });
    const first = await signupApi.getSession();

    const loginApi = createFixtureAuthApi({ env: DEV, challengeStore: store });
    const l = await loginApi.login({ method: "phone_otp", phone: PHONE });
    if (!l.ok || l.data.kind !== "otp_challenge") throw new Error("expected challenge");
    await loginApi.verifyOtp({ challengeId: l.data.challenge.challengeId, code: FIXTURE_OTP_CODE });
    const second = await loginApi.getSession();
    if (!first.ok || !second.ok || first.data.kind !== "authenticated" || second.data.kind !== "authenticated") throw new Error("expected sessions");
    expect(second.data.identity.userId).toBe(first.data.identity.userId);
  });

  it("resend works after an expired verify attempt, and a replaced challenge cannot be resent again", async () => {
    let t = new Date("2026-11-18T10:00:00Z");
    const api = createFixtureAuthApi({ env: DEV, now: () => t, challengeStore: createFixtureChallengeStore() });
    const s = await api.signup(signupInput);
    if (!s.ok || s.data.kind !== "otp_challenge") throw new Error("expected challenge");
    const id = s.data.challenge.challengeId;
    t = new Date("2026-11-18T10:10:00Z");
    expect((await api.verifyOtp({ challengeId: id, code: FIXTURE_OTP_CODE })).ok).toBe(false);
    const resent = await api.resendOtp(id);
    expect(resent.ok).toBe(true);
    expect(await api.resendOtp(id)).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("landing path", () => {
  it("sends a non-active admin to a route the guard allows", () => {
    const identity: Identity = {
      userId: FIXTURE_IDS.adminUser,
      displayName: "Synthetic",
      locale: "en",
      workspaces: [{ role: "admin", state: "restricted" }],
    };
    expect(landingPathFor(identity)).toBe("/en/account/security");
  });
});

describe("http client", () => {
  it("token lookup failure returns an ApiResult instead of rejecting", async () => {
    const fetchSpy: FetchLike = vi.fn(async () => new Response("{}"));
    const api = createHttpAuthApi({ fetch: fetchSpy, getAccessToken: async () => Promise.reject(new Error("store down")) });
    await expect(api.getSession()).resolves.toEqual({ ok: false, error: { code: "unavailable" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses Retry-After as seconds or HTTP-date", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(parseRetryAfter("120", now)).toBe(120);
    expect(parseRetryAfter("Wed, 18 Nov 2026 10:01:30 GMT", now)).toBe(90);
    expect(parseRetryAfter("Wed, 18 Nov 2026 09:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });

  it("surfaces an HTTP-date Retry-After on 429", async () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const f: FetchLike = async () => new Response("{}", { status: 429, headers: { "Retry-After": future } });
    const r = await createHttpAuthApi({ fetch: f }).login({ method: "email_password", email: "a@example.invalid", password: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("onboarding fixture", () => {
  it("validates document expiry against the fixture clock", async () => {
    const store = createFixtureOnboardingStore();
    const api = createFixtureOnboardingApi({ env: DEV, store, now: () => new Date("2030-01-03T00:00:00Z") });
    const r = await api.registerProviderDocument(FIXTURE_IDS.doctorDraftProvider, {
      kind: "registration",
      contentType: "application/pdf",
      expiresAt: "2030-01-02T00:00:00Z",
      expectedVersion: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.fields).toHaveProperty("expiresAt", "expiry_in_past");
  });

  it("rejects questionnaire submission when the account is not verified", async () => {
    const store = createFixtureOnboardingStore();
    store.patientDrafts.set("actor-x", { version: 0, updatedAt: null, sections: {} });
    const api = createFixtureOnboardingApi({ env: DEV, store, actorId: "actor-x" });
    const complete = createFixtureOnboardingApi({ env: DEV, patientDraft: "complete", actorId: "y" });
    const draft = await complete.getPatientDraft();
    if (!draft.ok) throw new Error("draft");
    const s = draft.data.sections;
    const payload = {
      personal: s.personal!, bloodGroup: s.bloodGroup!, measurements: s.measurements!, allergies: s.allergies!, medicines: s.medicines!,
      surgeries: s.surgeries!, medicalHistory: s.medicalHistory!, family: s.family!, documents: s.documents!, consent: s.review!,
    };
    expect(await api.submitPatientQuestionnaire(payload)).toEqual({ ok: false, error: { code: "validation", fields: { account: "contact_unverified" } } });
    expect((await complete.submitPatientQuestionnaire(payload)).ok).toBe(true);
  });

  it("evidence enters a draft only through registration", async () => {
    const store = createFixtureOnboardingStore();
    const api = createFixtureOnboardingApi({ env: DEV, store });
    const forged = { documents: [{ kind: "registration", documentId: "00000000-0000-4000-8000-00000000ffff" }] };
    expect(await api.saveProviderSection(FIXTURE_IDS.doctorDraftProvider, "doctor", "documents", forged, 2)).toEqual({
      ok: false,
      error: { code: "validation", fields: { sectionId: "server_managed" } },
    });
    // Even a draft that already holds an unregistered reference cannot be submitted.
    const draft = store.providers.get(FIXTURE_IDS.doctorDraftProvider);
    if (!draft || draft.category !== "doctor") throw new Error("draft");
    const hours = [{ day: "mon" as const, opens: "09:00", closes: "10:00" }];
    draft.sections = {
      ...draft.sections,
      identity: {
        registrationNumber: "SYN-1", issuingAuthority: "Synthetic Council", qualifications: [{ degree: "MBBS" }],
        specialty: "General", experienceYears: 1, languages: ["en"], city: "Synthetic City", photoAssetId: "00000000-0000-4000-8000-00000000aaaa",
      },
      practice: { homeVisitFeePaise: 50_000, servicePins: ["500001"], travelRadiusKm: 5, startingPoint: { pinCode: "500001", locality: "X" } },
      availability: { weeklyHours: hours },
      documents: { documents: [{ kind: "registration", documentId: "00000000-0000-4000-8000-00000000ffff" }] },
    };
    expect(await api.submitProvider(FIXTURE_IDS.doctorDraftProvider, 2)).toEqual({
      ok: false,
      error: { code: "validation", fields: { documents: "unregistered_document" } },
    });
    const reg = await api.registerProviderDocument(FIXTURE_IDS.doctorDraftProvider, {
      kind: "registration", contentType: "application/pdf", expiresAt: "2099-01-01T00:00:00Z", expectedVersion: 2,
    });
    expect(reg.ok).toBe(true);
    expect((await api.submitProvider(FIXTURE_IDS.doctorDraftProvider, 3)).ok).toBe(true);
  });
});

describe("verification fixture", () => {
  it("an invalid clock aborts without changing status or version", async () => {
    const store = createFixtureVerificationStore();
    const api = createFixtureVerificationApi({ env: DEV, store, now: () => new Date(Number.NaN) });
    const id = FIXTURE_IDS.doctorSubmittedProvider;
    expect(await api.startReview(id, { reason: "r", expectedVersion: 4 })).toEqual({ ok: false, error: { code: "unavailable" } });
    const lab = FIXTURE_IDS.labProvider;
    expect(await api.submitDecision(lab, { decision: "approve", reason: "r", expectedVersion: 7 })).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(store.providers.get(id)?.version).toBe(4);
    expect(store.providers.get(id)?.status).toBe("submitted");
    expect(store.providers.get(lab)?.documents[0].status).toBe("pending");
  });
});
