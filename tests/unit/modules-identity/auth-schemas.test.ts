import { describe, expect, it } from "vitest";
import {
  loginSchema,
  normalizeOtpInput,
  otpVerifySchema,
  secondsUntilResend,
  signupSchema,
  type OtpChallenge,
} from "@/modules/auth/schemas";
import { SIGNUP_ROLES } from "@/modules/auth/roles";

const emailSignup = {
  method: "email_password",
  role: "patient",
  email: "someone@example.invalid",
  password: "a-long-enough-password",
  acceptedTerms: true,
  termsVersion: "terms-v0",
} as const;

describe("signup schema", () => {
  it("accepts every non-admin signup role", () => {
    for (const role of SIGNUP_ROLES) {
      expect(signupSchema.safeParse({ ...emailSignup, role }).success).toBe(true);
    }
  });

  it("admin cannot sign up", () => {
    expect(SIGNUP_ROLES).not.toContain("admin");
    expect(signupSchema.safeParse({ ...emailSignup, role: "admin" }).success).toBe(false);
    expect(signupSchema.safeParse({ method: "phone_otp", role: "admin", phone: "+916000000000", acceptedTerms: true, termsVersion: "v" }).success).toBe(false);
  });

  it("rejects missing consent, short password and injected authority fields", () => {
    expect(signupSchema.safeParse({ ...emailSignup, acceptedTerms: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...emailSignup, password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...emailSignup, verificationState: "approved" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...emailSignup, isAdmin: true }).success).toBe(false);
  });

  it("validates Indian mobile numbers for phone signup", () => {
    const base = { method: "phone_otp", role: "doctor", acceptedTerms: true, termsVersion: "v" } as const;
    expect(signupSchema.safeParse({ ...base, phone: "+916000000000" }).success).toBe(true);
    for (const phone of ["6000000000", "+911000000000", "+9160000000", "+14155550100"]) {
      expect(signupSchema.safeParse({ ...base, phone }).success).toBe(false);
    }
  });
});

describe("login schema", () => {
  it("accepts legacy passwords but not empty ones", () => {
    expect(loginSchema.safeParse({ method: "email_password", email: "a@example.invalid", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ method: "email_password", email: "a@example.invalid", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ method: "email_password", email: "not-an-email", password: "x" }).success).toBe(false);
  });
});

describe("OTP", () => {
  it("normalizes pasted codes and rejects non-six-digit input", () => {
    expect(normalizeOtpInput(" 246 810 ")).toBe("246810");
    expect(otpVerifySchema.safeParse({ challengeId: "c1", code: "246-810" }).success).toBe(true);
    expect(otpVerifySchema.safeParse({ challengeId: "c1", code: "24681" }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ challengeId: "c1", code: "24681a" }).success).toBe(false);
  });

  const challenge: OtpChallenge = {
    challengeId: "c1",
    channel: "sms",
    maskedDestination: "+91 ******0000",
    status: "pending",
    expiresAt: "2026-11-18T10:05:00Z",
    resendAvailableAt: "2026-11-18T10:00:30Z",
    resendsRemaining: 2,
    attemptsRemaining: 5,
    serverNow: "2026-11-18T10:00:00Z",
  };

  it("counts down from server time, correcting client clock skew", () => {
    // Client clock is 1 hour ahead of the server.
    const received = new Date("2026-11-18T11:00:00Z");
    expect(secondsUntilResend(challenge, received, received)).toBe(30);
    expect(secondsUntilResend(challenge, new Date("2026-11-18T11:00:20Z"), received)).toBe(10);
    expect(secondsUntilResend(challenge, new Date("2026-11-18T11:00:31Z"), received)).toBe(0);
  });

  it("never allows resend when exhausted or not pending", () => {
    const t = new Date("2026-11-18T10:10:00Z");
    expect(secondsUntilResend({ ...challenge, resendsRemaining: 0 }, t, t)).toBe(Number.POSITIVE_INFINITY);
    expect(secondsUntilResend({ ...challenge, status: "locked" }, t, t)).toBe(Number.POSITIVE_INFINITY);
  });
});
