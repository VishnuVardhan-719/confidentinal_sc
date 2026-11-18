import { fail, ok } from "@/lib/api/result";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_OTP_CODE,
  FIXTURE_OTP_MAX_ATTEMPTS,
  FIXTURE_OTP_MAX_RESENDS,
  FIXTURE_OTP_RESEND_COOLDOWN_SECONDS,
  FIXTURE_OTP_TTL_SECONDS,
  FIXTURE_SCENARIOS,
  FIXTURE_SESSIONS,
  type FixtureScenario,
} from "@/fixtures/identity";
import type { AuthApi } from "./api";
import { assertFixtureAllowed, type FixtureOptions } from "./fixture-guard";
import { validateInput } from "./http-client";
import { loginSchema, otpVerifySchema, signupSchema, type OtpChallenge } from "./schemas";
import type { Session, SessionTokens } from "./types";

/**
 * Synthetic AuthApi. Pages using it must render <FixtureNotice/>.
 * Fixture "tokens" are opaque placeholders that name a synthetic scenario so a fixture
 * session survives across requests in the dev server. They are not JWTs, grant nothing
 * over HTTP, and the fixture adapter cannot be constructed when APP_ENV=production.
 */

/** Internal record; `phone`, `scenario` and `superseded` never leave the adapter. */
type Challenge = OtpChallenge & { scenario: FixtureScenario; phone: string; superseded: boolean };

export type FixtureChallengeStore = {
  challenges: Map<string, Challenge>;
  /** Phone -> scenario chosen at OTP signup, so a later OTP login resolves to the same synthetic user. */
  phones: Map<string, FixtureScenario>;
};

const ACCESS_PREFIX = "fixture-session.";
const REFRESH_PREFIX = "fixture-refresh.";

export const fixtureTokensFor = (scenario: FixtureScenario): SessionTokens => ({
  accessToken: `${ACCESS_PREFIX}${scenario}`,
  refreshToken: `${REFRESH_PREFIX}${scenario}`,
  expiresAt: null,
});

const isScenario = (value: string): value is FixtureScenario =>
  (FIXTURE_SCENARIOS as readonly string[]).includes(value);

/** Scenario named by a fixture access token, or null for anything else. */
export function fixtureScenarioFromToken(token: string | null | undefined, prefix = ACCESS_PREFIX): FixtureScenario | null {
  if (!token || !token.startsWith(prefix)) return null;
  const scenario = token.slice(prefix.length);
  return isScenario(scenario) ? scenario : null;
}

const mask = (phone: string): string => `+91 ******${phone.slice(-4)}`;

export const createFixtureChallengeStore = (): FixtureChallengeStore => ({ challenges: new Map(), phones: new Map() });

/** Dev-server process memory so an OTP challenge survives between server actions. */
const sharedStore: FixtureChallengeStore = createFixtureChallengeStore();

/** Default scenario for an OTP login from a phone that never signed up in fixture mode. */
const DEFAULT_OTP_LOGIN_SCENARIO: FixtureScenario = "patient_complete";

export type FixtureAuthOptions = FixtureOptions & {
  scenario?: FixtureScenario;
  /** Fixture access token from the session cookie; overrides `scenario`. */
  accessToken?: string | null;
  challengeStore?: FixtureChallengeStore;
};

export function createFixtureAuthApi(options: FixtureAuthOptions = {}): AuthApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  const fromToken = options.accessToken !== undefined ? fixtureScenarioFromToken(options.accessToken) : null;
  let current: Session = FIXTURE_SESSIONS[fromToken ?? options.scenario ?? "anonymous"];
  let currentScenario: FixtureScenario = fromToken ?? options.scenario ?? "anonymous";
  const store = options.challengeStore ?? sharedStore;
  const challenges = store.challenges;
  /** Challenges started through this API instance (invalidated on logout). */
  const issuedHere = new Set<string>();

  function issueChallenge(phone: string, scenario: FixtureScenario, resendsRemaining = FIXTURE_OTP_MAX_RESENDS): Challenge {
    const t = now().getTime();
    const challenge: Challenge = {
      challengeId: `fixture-challenge-${crypto.randomUUID()}`,
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
      superseded: false,
    };
    challenges.set(challenge.challengeId, challenge);
    issuedHere.add(challenge.challengeId);
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
      const scenario = store.phones.get(valid.data.phone) ?? (valid.data.role === "patient" ? "patient_new" : "doctor_draft");
      store.phones.set(valid.data.phone, scenario);
      return ok({ kind: "otp_challenge", challenge: publicChallenge(issueChallenge(valid.data.phone, scenario)) });
    },

    async verifyOtp(input) {
      const valid = validateInput(otpVerifySchema, input);
      if (!valid.ok) return valid.result;
      const challenge = challenges.get(valid.data.challengeId);
      if (!challenge) return fail("not_found");
      if (challenge.status === "locked" || challenge.attemptsRemaining <= 0) return fail("rate_limited");
      if (challenge.status !== "pending" || challenge.superseded || now().getTime() >= Date.parse(challenge.expiresAt)) {
        if (challenge.status === "pending") challenge.status = "expired";
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
      currentScenario = challenge.scenario;
      return ok({ kind: "verified", session: fixtureTokensFor(challenge.scenario) });
    },

    async resendOtp(challengeId) {
      const challenge = challenges.get(challengeId);
      // Eligibility depends on the challenge itself, not on whether verify ran first:
      // a time-expired (pending or expired) challenge can be replaced; verified,
      // locked or already-replaced ones cannot.
      if (!challenge || challenge.superseded || challenge.status === "verified") return fail("not_found");
      if (challenge.status === "locked") return fail("rate_limited");
      const waitMs = Date.parse(challenge.resendAvailableAt) - now().getTime();
      if (waitMs > 0) return fail("rate_limited", { retryAfterSeconds: Math.ceil(waitMs / 1000) });
      if (challenge.resendsRemaining <= 0) return fail("rate_limited");
      challenge.status = "expired";
      challenge.superseded = true;
      const next = issueChallenge(challenge.phone, challenge.scenario, challenge.resendsRemaining - 1);
      return ok(publicChallenge(next));
    },

    async login(input) {
      const valid = validateInput(loginSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.method === "phone_otp") {
        const scenario = store.phones.get(valid.data.phone) ?? DEFAULT_OTP_LOGIN_SCENARIO;
        return ok({ kind: "otp_challenge", challenge: publicChallenge(issueChallenge(valid.data.phone, scenario)) });
      }
      const scenario = FIXTURE_ACCOUNTS[valid.data.email.toLowerCase()];
      // Unknown account and wrong password look identical (no enumeration).
      if (!scenario) return fail("unauthenticated");
      const session = FIXTURE_SESSIONS[scenario];
      current = session;
      currentScenario = scenario;
      if (session.kind === "restricted") return fail("forbidden");
      return ok({ kind: "signed_in", session: fixtureTokensFor(scenario) });
    },

    async refresh(refreshToken) {
      const scenario = fixtureScenarioFromToken(refreshToken, REFRESH_PREFIX);
      if (!scenario || FIXTURE_SESSIONS[scenario].kind !== "authenticated") return fail("unauthenticated");
      current = FIXTURE_SESSIONS[scenario];
      currentScenario = scenario;
      return ok(fixtureTokensFor(scenario));
    },

    async logout() {
      // Pending challenges must not be able to sign the caller back in after sign-out.
      for (const c of challenges.values()) {
        const ownedHere = issuedHere.has(c.challengeId);
        const sameUser = currentScenario !== "anonymous" && c.scenario === currentScenario;
        if (c.status === "pending" && (ownedHere || sameUser)) {
          c.status = "expired";
          c.superseded = true;
        }
      }
      current = FIXTURE_SESSIONS.anonymous;
      currentScenario = "anonymous";
      return ok({ status: "signed_out" });
    },
  };
}
