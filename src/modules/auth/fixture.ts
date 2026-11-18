import { fail, ok } from "@/lib/api/result";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_OTP_CODE,
  FIXTURE_OTP_MAX_ATTEMPTS,
  FIXTURE_OTP_MAX_RESENDS,
  FIXTURE_OTP_RESEND_COOLDOWN_SECONDS,
  FIXTURE_OTP_TTL_SECONDS,
  FIXTURE_SESSIONS,
  type FixtureScenario,
} from "@/fixtures/identity";
import type { AuthApi } from "./api";
import { assertFixtureAllowed, type FixtureOptions } from "./fixture-guard";
import { validateInput } from "./http-client";
import { loginSchema, otpVerifySchema, signupSchema, type OtpChallenge } from "./schemas";
import type { Session, SessionTokens } from "./types";

/** Synthetic AuthApi. Pages using it must render <FixtureNotice/>. Tokens are placeholders. */

/** Internal record; `phone` and `scenario` never leave the adapter. */
type Challenge = OtpChallenge & { scenario: FixtureScenario; phone: string };

const FIXTURE_TOKENS: SessionTokens = {
  accessToken: "fixture-access-token-not-a-jwt",
  refreshToken: "fixture-refresh-token",
  expiresAt: null,
};

const mask = (phone: string): string => `+91 ******${phone.slice(-4)}`;

export function createFixtureAuthApi(options: FixtureOptions & { scenario?: FixtureScenario } = {}): AuthApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  let current: Session = FIXTURE_SESSIONS[options.scenario ?? "anonymous"];
  const challenges = new Map<string, Challenge>();
  let counter = 0;

  function issueChallenge(phone: string, scenario: FixtureScenario, resendsRemaining = FIXTURE_OTP_MAX_RESENDS): Challenge {
    const t = now().getTime();
    counter += 1;
    const challenge: Challenge = {
      challengeId: `fixture-challenge-${counter}`,
      channel: "sms",
      maskedDestination: mask(phone),
      status: "pending",
      expiresAt: new Date(t + FIXTURE_OTP_TTL_SECONDS * 1000).toISOString(),
      resendAvailableAt: new Date(t + FIXTURE_OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString(),
      resendsRemaining,
      attemptsRemaining: FIXTURE_OTP_MAX_ATTEMPTS,
      serverNow: new Date(t).toISOString(),
      scenario,
      phone,
    };
    challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  const publicChallenge = (c: Challenge): OtpChallenge => ({
    challengeId: c.challengeId,
    channel: c.channel,
    maskedDestination: c.maskedDestination,
    status: c.status,
    expiresAt: c.expiresAt,
    resendAvailableAt: c.resendAvailableAt,
    resendsRemaining: c.resendsRemaining,
    attemptsRemaining: c.attemptsRemaining,
    serverNow: now().toISOString(),
  });

  return {
    async getSession() {
      return ok(current);
    },

    async signup(input) {
      const valid = validateInput(signupSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.method === "email_password") return ok({ kind: "received" });
      const scenario: FixtureScenario = valid.data.role === "patient" ? "patient_new" : "doctor_draft";
      return ok({ kind: "otp_challenge", challenge: publicChallenge(issueChallenge(valid.data.phone, scenario)) });
    },

    async verifyOtp(input) {
      const valid = validateInput(otpVerifySchema, input);
      if (!valid.ok) return valid.result;
      const challenge = challenges.get(valid.data.challengeId);
      if (!challenge) return fail("not_found");
      if (challenge.status === "locked" || challenge.attemptsRemaining <= 0) return fail("rate_limited");
      if (challenge.status !== "pending" || now().getTime() >= Date.parse(challenge.expiresAt)) {
        challenge.status = challenge.status === "verified" ? "verified" : "expired";
        return fail("validation", { fields: { code: "otp_expired" } });
      }
      if (valid.data.code !== FIXTURE_OTP_CODE) {
        challenge.attemptsRemaining -= 1;
        if (challenge.attemptsRemaining <= 0) {
          challenge.status = "locked";
          return fail("rate_limited");
        }
        return fail("validation", { fields: { code: "otp_invalid" } });
      }
      challenge.status = "verified";
      current = FIXTURE_SESSIONS[challenge.scenario];
      return ok({ kind: "verified", session: FIXTURE_TOKENS });
    },

    async resendOtp(challengeId) {
      const challenge = challenges.get(challengeId);
      if (!challenge || challenge.status !== "pending") return fail("not_found");
      const waitMs = Date.parse(challenge.resendAvailableAt) - now().getTime();
      if (waitMs > 0) return fail("rate_limited", { retryAfterSeconds: Math.ceil(waitMs / 1000) });
      if (challenge.resendsRemaining <= 0) return fail("rate_limited");
      challenge.status = "expired";
      const next = issueChallenge(challenge.phone, challenge.scenario, challenge.resendsRemaining - 1);
      return ok(publicChallenge(next));
    },

    async login(input) {
      const valid = validateInput(loginSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.method === "phone_otp") {
        return ok({ kind: "otp_challenge", challenge: publicChallenge(issueChallenge(valid.data.phone, "patient_complete")) });
      }
      const scenario = FIXTURE_ACCOUNTS[valid.data.email.toLowerCase()];
      // Unknown account and wrong password look identical (no enumeration).
      if (!scenario) return fail("unauthenticated");
      const session = FIXTURE_SESSIONS[scenario];
      if (session.kind === "restricted") {
        current = session;
        return fail("forbidden");
      }
      current = session;
      return ok({ kind: "signed_in", session: FIXTURE_TOKENS });
    },

    async refresh(refreshToken) {
      if (current.kind !== "authenticated" || refreshToken !== FIXTURE_TOKENS.refreshToken) return fail("unauthenticated");
      return ok(FIXTURE_TOKENS);
    },

    async logout() {
      current = FIXTURE_SESSIONS.anonymous;
      return ok({ status: "signed_out" });
    },
  };
}
