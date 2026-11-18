import { describe, expect, it, vi } from "vitest";
import { createFixtureAuthApi, createFixtureChallengeStore, fixtureScenarioFromToken, fixtureTokensFor } from "@/modules/auth/fixture";
import { runLogin, runLogout, runResendOtp, runSignup, runVerifyOtp, type AuthDeps } from "@/modules/auth/flows";
import { authErrorKey } from "@/modules/auth/errors";
import type { AuthApi } from "@/modules/auth/api";
import type { SessionTokens } from "@/modules/auth/types";
import { FIXTURE_OTP_CODE } from "@/fixtures/identity";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

function deps(api: AuthApi = createFixtureAuthApi({ env: DEV, challengeStore: createFixtureChallengeStore() })) {
  const written: SessionTokens[] = [];
  const cleared = vi.fn();
  const d: AuthDeps = {
    api,
    writeTokens: (t) => {
      written.push(t);
      return true;
    },
    clearTokens: cleared,
    sessionFor: (token) => createFixtureAuthApi({ env: DEV, accessToken: token }).getSession(),
  };
  return { d, written, cleared };
}

describe("fixture tokens", () => {
  it("name a scenario and nothing else", () => {
    expect(fixtureScenarioFromToken(fixtureTokensFor("admin").accessToken)).toBe("admin");
    expect(fixtureScenarioFromToken("fixture-session.superuser")).toBeNull();
    expect(fixtureScenarioFromToken("eyJhbGciOi.real.jwt")).toBeNull();
  });
});

describe("runLogin", () => {
  it("signs in, writes cookies and honours a safe next path", async () => {
    const { d, written } = deps();
    const state = await runLogin(d, form({ method: "email_password", email: "patient.complete@example.invalid", password: "x", locale: "te", next: "/te/patient/bookings" }));
    expect(state).toEqual({ status: "redirect", to: "/te/patient/bookings" });
    expect(written).toHaveLength(1);
  });

  it("ignores external or unauthorized next targets", async () => {
    const { d } = deps();
    expect(await runLogin(d, form({ method: "email_password", email: "patient.complete@example.invalid", password: "x", next: "https://evil.example" }))).toEqual({
      status: "redirect",
      to: "/en/patient/dashboard",
    });
    const { d: d2 } = deps();
    expect(await runLogin(d2, form({ method: "email_password", email: "patient.complete@example.invalid", password: "x", next: "/en/admin/audit" }))).toEqual({
      status: "redirect",
      to: "/en/patient/dashboard",
    });
  });

  it("never echoes the password and reports invalid credentials generically", async () => {
    const { d, written } = deps();
    const state = await runLogin(d, form({ method: "email_password", email: "nobody@example.invalid", password: "secret-password" }));
    expect(state).toMatchObject({ status: "error", errorKey: "auth.errors.invalidCredentials", values: { email: "nobody@example.invalid" } });
    expect(JSON.stringify(state)).not.toContain("secret-password");
    expect(written).toHaveLength(0);
  });

  it("restricted accounts are refused", async () => {
    const { d, written } = deps();
    expect(await runLogin(d, form({ method: "email_password", email: "disabled@example.invalid", password: "x" }))).toMatchObject({
      status: "error",
      errorKey: "auth.errors.accountRestricted",
    });
    expect(written).toHaveLength(0);
  });

  it("phone login moves to the OTP step", async () => {
    const { d } = deps();
    const state = await runLogin(d, form({ method: "phone_otp", phone: "+916000000000" }));
    expect(state).toMatchObject({ status: "otp", purpose: "login", role: null });
  });
});

describe("runSignup + OTP", () => {
  it("email signup always shows the same confirmation (no enumeration)", async () => {
    const { d } = deps();
    const base = { method: "email_password", password: "a-long-enough-password", acceptedTerms: "on", termsVersion: "v0", role: "patient" };
    expect(await runSignup(d, form({ ...base, email: "patient.complete@example.invalid" }))).toEqual({ status: "check_email", email: "patient.complete@example.invalid" });
    expect(await runSignup(d, form({ ...base, email: "new@example.invalid" }))).toEqual({ status: "check_email", email: "new@example.invalid" });
  });

  it("rejects admin role and missing consent with field errors", async () => {
    const { d } = deps();
    const state = await runSignup(d, form({ method: "email_password", email: "a@example.invalid", password: "a-long-enough-password", termsVersion: "v", role: "admin" }));
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors).toHaveProperty("role");
      expect(state.fieldErrors).toHaveProperty("acceptedTerms");
      expect(state.values.role).toBeUndefined();
    }
  });

  it("phone signup -> wrong code -> resend throttled -> verify -> onboarding of the chosen role", async () => {
    const { d, written } = deps();
    const started = await runSignup(d, form({ method: "phone_otp", phone: "+916000000001", acceptedTerms: "on", termsVersion: "v", role: "doctor", locale: "en" }));
    if (started.status !== "otp") throw new Error("expected otp");
    const ctx = { challengeId: started.challenge.challengeId, purpose: "signup", role: "doctor", locale: "en" };

    const wrong = await runVerifyOtp(d, form({ ...ctx, code: "000000" }), started.challenge);
    expect(wrong).toMatchObject({ status: "otp", errorKey: "auth.errors.otpInvalid" });

    const throttled = await runResendOtp(d, form(ctx), started.challenge);
    expect(throttled).toMatchObject({ status: "otp", errorKey: "auth.errors.rateLimited" });
    if (throttled.status === "otp") expect(throttled.retryAfterSeconds).toBeGreaterThan(0);

    const ok = await runVerifyOtp(d, form({ ...ctx, code: ` ${FIXTURE_OTP_CODE.slice(0, 3)} ${FIXTURE_OTP_CODE.slice(3)} ` }), started.challenge);
    expect(ok).toEqual({ status: "redirect", to: "/en/doctor/onboarding" });
    expect(written).toHaveLength(1);
  });
});

describe("runLogout", () => {
  it("clears cookies even when the server call fails", async () => {
    const api = createFixtureAuthApi({ env: DEV });
    const failing: AuthApi = { ...api, logout: async () => Promise.reject(new Error("down")) };
    const cleared = vi.fn();
    await expect(runLogout({ api: failing, clearTokens: cleared }, form({ locale: "hi" }))).rejects.toThrow();
    expect(cleared).toHaveBeenCalledTimes(1);
    const ok = await runLogout({ api, clearTokens: cleared }, form({ locale: "hi" }));
    expect(ok).toEqual({ status: "redirect", to: "/hi/login?reason=signed_out" });
  });
});

describe("authErrorKey", () => {
  it("maps codes per flow", () => {
    expect(authErrorKey({ code: "conflict" }, "signup")).toBe("auth.errors.accountExists");
    expect(authErrorKey({ code: "gated" }, "login")).toBe("auth.errors.methodUnavailable");
    expect(authErrorKey({ code: "validation", fields: { code: "otp_expired" } }, "otp_verify")).toBe("auth.errors.otpExpired");
    expect(authErrorKey({ code: "unavailable" }, "login")).toBe("errors.unavailable");
  });
});
