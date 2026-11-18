import type { ArrivalChallenge, OtpErrorCode, VerifyArrivalOutcome } from "./types";

/**
 * Pure view logic for the doctor's arrival-code form (DC02).
 * The challenge object never contains the code. The code the doctor types is transient form
 * state only and is not part of any value returned from here.
 */
export type ChallengePhase = "enter_code" | "expired" | "locked" | "verified" | "superseded";

export type ChallengeView = {
  phase: ChallengePhase;
  /** Advisory countdown from server expiry. Server remains authoritative. */
  secondsLeft: number;
  attemptsRemaining: number;
  canSubmit: boolean;
  canResend: boolean;
  /** Seconds until resend unlocks (0 if available now or never). */
  resendInSeconds: number;
};

const secondsBetween = (fromMs: number, toIso: string) => Math.max(0, Math.ceil((Date.parse(toIso) - fromMs) / 1000));

export function deriveChallengeView(ch: ArrivalChallenge, now: Date): ChallengeView {
  const nowMs = now.getTime();
  const expired = ch.status === "expired" || (ch.status === "active" && Date.parse(ch.expiresAt) <= nowMs);
  const locked = ch.status === "locked" || (ch.status === "active" && ch.attemptsRemaining === 0);

  let phase: ChallengePhase;
  if (ch.status === "verified") phase = "verified";
  else if (ch.status === "superseded") phase = "superseded";
  else if (locked) phase = "locked";
  else if (expired) phase = "expired";
  else phase = "enter_code";

  const resendInSeconds = ch.resendAvailableAt ? secondsBetween(nowMs, ch.resendAvailableAt) : 0;
  const canResend = phase !== "verified" && ch.resendsRemaining > 0 && ch.resendAvailableAt !== null && resendInSeconds === 0;

  return {
    phase,
    secondsLeft: phase === "enter_code" ? secondsBetween(nowMs, ch.expiresAt) : 0,
    attemptsRemaining: ch.attemptsRemaining,
    canSubmit: phase === "enter_code",
    canResend,
    resendInSeconds,
  };
}

/** Message key for each OTP error the UI can show. Never reveals whether a code was close. */
export const OTP_ERROR_LABEL_KEYS: Readonly<Record<OtpErrorCode, string>> = {
  invalid_code: "doctor.arrival.error.invalidCode",
  expired: "doctor.arrival.error.expired",
  replayed: "doctor.arrival.error.replayed",
  attempts_exhausted: "doctor.arrival.error.attemptsExhausted",
  wrong_doctor: "doctor.arrival.error.notAssigned",
  resend_limited: "doctor.arrival.error.resendLimited",
  no_active_challenge: "doctor.arrival.error.noActiveChallenge",
};

/** Map a verify outcome to an OTP error code for display, or null when verified. */
export function otpErrorFromOutcome(outcome: VerifyArrivalOutcome): OtpErrorCode | null {
  return outcome.result === "verified" ? null : outcome.reason;
}
