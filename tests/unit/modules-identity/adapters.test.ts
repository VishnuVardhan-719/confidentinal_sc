import { describe, expect, it, vi } from "vitest";
import { getAuthApi } from "@/modules/auth";
import { createFixtureAuthApi, createFixtureChallengeStore } from "@/modules/auth/fixture";
import { createHttpAuthApi } from "@/modules/auth/http";
import type { FetchLike } from "@/modules/auth/http-client";
import { getOnboardingApi } from "@/modules/onboarding";
import { createFixtureOnboardingApi } from "@/modules/onboarding/fixture";
import { createHttpOnboardingApi } from "@/modules/onboarding/http";
import { getVerificationApi } from "@/modules/verification";
import { createFixtureVerificationApi, createFixtureVerificationStore } from "@/modules/verification/fixture";
import { createHttpVerificationApi } from "@/modules/verification/http";
import { FIXTURE_IDS, FIXTURE_OTP_CODE } from "@/fixtures/identity";

const PROD = { FRONTEND_ADAPTER: "fixture", APP_ENV: "production" };
const DEV_FIXTURE = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };

type Call = { url: string; init: RequestInit };

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  };
  return { fn, calls };
}

const bodyOf = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;

describe("fixture refused in production", () => {
  it("module factories throw", () => {
    expect(() => getAuthApi({ env: PROD })).toThrow(/not allowed|fixtures are disabled/);
    expect(() => getOnboardingApi({ env: PROD })).toThrow(/not allowed|fixtures are disabled/);
    expect(() => getVerificationApi({ env: PROD })).toThrow(/not allowed|fixtures are disabled/);
  });

  it("direct fixture constructors throw too", () => {
    expect(() => createFixtureAuthApi({ env: PROD })).toThrow();
    expect(() => createFixtureOnboardingApi({ env: PROD })).toThrow();
    expect(() => createFixtureVerificationApi({ env: PROD })).toThrow();
  });

  it("default mode is http; fixture only when asked outside production", async () => {
    const fetcher = mockFetch(401, { error: { code: "unauthenticated" } });
    const http = getAuthApi({ env: {}, http: { fetch: fetcher.fn, getAccessToken: () => "t" } });
    expect(await http.getSession()).toEqual({ ok: true, data: { kind: "anonymous" } });
    expect(fetcher.calls).toHaveLength(1);
    const fixture = getAuthApi({ env: DEV_FIXTURE, fixture: { scenario: "admin" } });
    const session = await fixture.getSession();
    expect(session.ok && session.data.kind).toBe("authenticated");
  });
});

describe("AuthApi http adapter", () => {
  it("maps /api/auth/me to a session, dropping unknown roles", async () => {
    const f = mockFetch(200, {
      profile: { id: FIXTURE_IDS.patientNew, display_name: "Synthetic", locale: "te", version: 1 },
      roles: ["patient", "doctor", "superuser"],
    });
    const api = createHttpAuthApi({ fetch: f.fn, getAccessToken: () => "token" });
    const result = await api.getSession();
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "authenticated") throw new Error("expected session");
    expect(result.data.identity.workspaces.map((w) => w.role)).toEqual(["patient", "doctor"]);
    expect(result.data.identity.workspaces[0].state).toBe("unknown");
    expect(f.calls[0].url).toBe("/api/auth/me");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(f.calls[0].init.cache).toBe("no-store");
  });

  it("no token means anonymous without a network call; disabled account is restricted", async () => {
    const none = mockFetch(200, {});
    expect(await createHttpAuthApi({ fetch: none.fn }).getSession()).toEqual({ ok: true, data: { kind: "anonymous" } });
    expect(none.calls).toHaveLength(0);
    const disabled = mockFetch(403, { error: { code: "inactive_account" } });
    expect(await createHttpAuthApi({ fetch: disabled.fn, getAccessToken: () => "t" }).getSession()).toEqual({
      ok: true,
      data: { kind: "restricted", reason: "account_disabled" },
    });
  });

  it("malformed server responses are unavailable, never trusted", async () => {
    const f = mockFetch(200, { profile: { id: "not-a-uuid" }, roles: ["admin"] });
    const result = await createHttpAuthApi({ fetch: f.fn, getAccessToken: () => "t" }).getSession();
    expect(result).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it("signup sends only credentials and never the role", async () => {
    const f = mockFetch(202, { status: "signup_received" });
    const api = createHttpAuthApi({ fetch: f.fn });
    const result = await api.signup({
      method: "email_password",
      role: "doctor",
      email: "someone@example.invalid",
      password: "a-long-enough-password",
      acceptedTerms: true,
      termsVersion: "v0",
    });
    expect(result).toEqual({ ok: true, data: { kind: "received" } });
    expect(bodyOf(f.calls[0])).toEqual({ email: "someone@example.invalid", password: "a-long-enough-password" });
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("admin signup is rejected before any network call", async () => {
    const f = mockFetch(202, { status: "signup_received" });
    const api = createHttpAuthApi({ fetch: f.fn });
    const forged = { method: "email_password", role: "admin", email: "a@example.invalid", password: "a-long-enough-password", acceptedTerms: true, termsVersion: "v" };
    const result = await api.signup(forged as unknown as Parameters<typeof api.signup>[0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
    expect(f.calls).toHaveLength(0);
  });

  it("phone OTP has no contract yet and is gated", async () => {
    const f = mockFetch(200, {});
    const api = createHttpAuthApi({ fetch: f.fn });
    expect(await api.verifyOtp({ challengeId: "c", code: "123456" })).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.resendOtp("c")).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.signup({ method: "phone_otp", role: "patient", phone: "+916000000000", acceptedTerms: true, termsVersion: "v" })).toEqual({
      ok: false,
      error: { code: "gated" },
    });
    expect(f.calls).toHaveLength(0);
  });

  it("maps 429 with Retry-After and network failure", async () => {
    const limited = mockFetch(429, { error: { code: "rate_limited" } }, { "Retry-After": "42" });
    expect(await createHttpAuthApi({ fetch: limited.fn }).login({ method: "email_password", email: "a@example.invalid", password: "x" })).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 42 },
    });
    const broken: FetchLike = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await createHttpAuthApi({ fetch: broken }).login({ method: "email_password", email: "a@example.invalid", password: "x" })).toEqual({
      ok: false,
      error: { code: "unavailable" },
    });
  });
});

describe("AuthApi fixture OTP flow", () => {
  it("handles wrong code, resend throttling and verification", async () => {
    let t = new Date("2026-11-18T10:00:00Z");
    const api = createFixtureAuthApi({ env: DEV_FIXTURE, now: () => t, challengeStore: createFixtureChallengeStore() });
    const signup = await api.signup({ method: "phone_otp", role: "patient", phone: "+916000000000", acceptedTerms: true, termsVersion: "v" });
    if (!signup.ok || signup.data.kind !== "otp_challenge") throw new Error("expected challenge");
    const { challengeId, maskedDestination } = signup.data.challenge;
    expect(maskedDestination).toBe("+91 ******0000");
    expect(JSON.stringify(signup.data)).not.toContain("6000000000");

    expect(await api.verifyOtp({ challengeId, code: "000000" })).toEqual({ ok: false, error: { code: "validation", fields: { code: "otp_invalid" } } });
    expect(await api.resendOtp(challengeId)).toEqual({ ok: false, error: { code: "rate_limited", retryAfterSeconds: 30 } });

    t = new Date("2026-11-18T10:00:31Z");
    const resent = await api.resendOtp(challengeId);
    if (!resent.ok) throw new Error("expected resend");
    expect(resent.data.resendsRemaining).toBe(2);
    expect(await api.verifyOtp({ challengeId, code: FIXTURE_OTP_CODE })).toMatchObject({ ok: false });

    const verified = await api.verifyOtp({ challengeId: resent.data.challengeId, code: FIXTURE_OTP_CODE });
    expect(verified.ok).toBe(true);
    const session = await api.getSession();
    expect(session.ok && session.data.kind).toBe("authenticated");
    // One-time use.
    expect((await api.verifyOtp({ challengeId: resent.data.challengeId, code: FIXTURE_OTP_CODE })).ok).toBe(false);
  });

  it("expired challenge is rejected", async () => {
    let t = new Date("2026-11-18T10:00:00Z");
    const api = createFixtureAuthApi({ env: DEV_FIXTURE, now: () => t, challengeStore: createFixtureChallengeStore() });
    const r = await api.login({ method: "phone_otp", phone: "+916000000000" });
    if (!r.ok || r.data.kind !== "otp_challenge") throw new Error("expected challenge");
    t = new Date("2026-11-18T10:06:00Z");
    expect(await api.verifyOtp({ challengeId: r.data.challenge.challengeId, code: FIXTURE_OTP_CODE })).toEqual({
      ok: false,
      error: { code: "validation", fields: { code: "otp_expired" } },
    });
  });

  it("unknown email and disabled account do not sign in", async () => {
    const api = createFixtureAuthApi({ env: DEV_FIXTURE });
    expect((await api.login({ method: "email_password", email: "nobody@example.invalid", password: "x" })).ok).toBe(false);
    expect((await api.login({ method: "email_password", email: "disabled@example.invalid", password: "x" })).ok).toBe(false);
    expect(await api.getSession()).toEqual({ ok: true, data: { kind: "restricted", reason: "account_disabled" } });
  });
});

describe("VerificationApi http adapter", () => {
  const row = { id: FIXTURE_IDS.labProvider, category: "lab", verification_state: "approved", status: "active", version: 8 };

  it("maps decisions to I02 values and returns derived status", async () => {
    const f = mockFetch(200, { provider: row });
    const api = createHttpVerificationApi({ fetch: f.fn, getAccessToken: () => "t" });
    const result = await api.submitDecision(FIXTURE_IDS.labProvider, { decision: "approve", reason: "Evidence checked", expectedVersion: 7 });
    expect(result).toEqual({ ok: true, data: { providerId: FIXTURE_IDS.labProvider, status: "active", version: 8 } });
    expect(f.calls[0].url).toBe(`/api/admin/providers/${FIXTURE_IDS.labProvider}/review`);
    expect(bodyOf(f.calls[0])).toEqual({ decision: "approved", reason: "Evidence checked", expectedVersion: 7 });
  });

  it("changes_required, queue and signed URLs are gated", async () => {
    const f = mockFetch(503, { error: { code: "provider_signed_urls_unavailable" } });
    const api = createHttpVerificationApi({ fetch: f.fn, getAccessToken: () => "t" });
    expect(await api.submitDecision(FIXTURE_IDS.labProvider, { decision: "changes_required", reason: "Need clearer licence", expectedVersion: 7 })).toEqual({
      ok: false,
      error: { code: "gated" },
    });
    expect(await api.listReviewQueue()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.requestDocumentUrl(FIXTURE_IDS.labProvider, FIXTURE_IDS.licenceDocument)).toEqual({ ok: false, error: { code: "gated" } });
    expect(f.calls).toHaveLength(1);
  });

  it("rejects non-UUID IDs before building URLs", async () => {
    const f = mockFetch(200, {});
    const api = createHttpVerificationApi({ fetch: f.fn, getAccessToken: () => "t" });
    expect((await api.getProviderForReview("../../auth/me")).ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
});

describe("VerificationApi fixture", () => {
  it("enforces transitions, versions and required evidence", async () => {
    const api = createFixtureVerificationApi({ env: DEV_FIXTURE, store: createFixtureVerificationStore() });
    const queue = await api.listReviewQueue();
    expect(queue.ok && queue.data.map((q) => q.status).sort()).toEqual(["submitted", "under_review"]);

    const doctor = FIXTURE_IDS.doctorSubmittedProvider;
    expect(await api.submitDecision(doctor, { decision: "approve", reason: "r", expectedVersion: 4 })).toEqual({
      ok: false,
      error: { code: "validation", fields: { decision: "invalid_transition" } },
    });
    expect(await api.startReview(doctor, { reason: "r", expectedVersion: 3 })).toEqual({ ok: false, error: { code: "conflict" } });
    const started = await api.startReview(doctor, { reason: "Starting", expectedVersion: 4 });
    expect(started).toEqual({ ok: true, data: { providerId: doctor, status: "under_review", version: 5 } });
    const approved = await api.submitDecision(doctor, { decision: "approve", reason: "Evidence checked", expectedVersion: 5 });
    expect(approved).toEqual({ ok: true, data: { providerId: doctor, status: "active", version: 6 } });
    expect(await api.requestDocumentUrl(doctor, FIXTURE_IDS.registrationDocument)).toEqual({ ok: false, error: { code: "gated" } });
  });
});

describe("OnboardingApi adapters", () => {
  it("http: only the listing section is persisted; others are gated", async () => {
    const f = mockFetch(200, { provider: { id: FIXTURE_IDS.doctorDraftProvider, category: "doctor", verification_state: "draft", status: "inactive", version: 3 } });
    const api = createHttpOnboardingApi({ fetch: f.fn, getAccessToken: () => "t" });
    const saved = await api.saveProviderSection(FIXTURE_IDS.doctorDraftProvider, "doctor", "listing", { displayName: "Synthetic Doctor" }, 2);
    expect(saved).toEqual({ ok: true, data: { providerId: FIXTURE_IDS.doctorDraftProvider, status: "draft", version: 3 } });
    expect(f.calls[0].init.method).toBe("PATCH");
    expect(bodyOf(f.calls[0])).toEqual({ displayName: "Synthetic Doctor", description: "", expectedVersion: 2 });
    const gated = await api.saveProviderSection(FIXTURE_IDS.doctorDraftProvider, "doctor", "availability", { weeklyHours: [{ day: "mon", opens: "09:00", closes: "10:00" }] }, 3);
    expect(gated).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.getPatientDraft()).toEqual({ ok: false, error: { code: "gated" } });
    expect(f.calls).toHaveLength(1);
  });

  it("fixture: refuses client-marked account verification, enforces versions and readiness", async () => {
    const api = createFixtureOnboardingApi({ env: DEV_FIXTURE, patientDraft: "empty" });
    expect(await api.savePatientSection("account", { contactVerified: true }, 0)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect((await api.savePatientSection("allergies", { state: "none" }, 0)).ok).toBe(true);
    expect(await api.savePatientSection("allergies", { state: "unknown" }, 0)).toEqual({ ok: false, error: { code: "conflict" } });

    const created = await api.createProvider({ category: "caretaker", displayName: "Synthetic Caregiver" });
    if (!created.ok) throw new Error("expected provider");
    const submitted = await api.submitProvider(created.data.providerId, 1);
    expect(submitted.ok).toBe(false);
    if (!submitted.ok) expect(submitted.error.fields).toHaveProperty("documents", "required");
  });
});
