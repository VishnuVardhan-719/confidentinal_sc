import { z } from "zod";
import { signupRoleSchema } from "./roles";

/** Indian mobile number in E.164 form. Example only: +919000000000 (fictional). */
export const indianMobileSchema = z.string().trim().regex(/^\+91[6-9]\d{9}$/, { message: "phone_invalid" });

export const emailSchema = z.email({ message: "email_invalid" }).max(254);

/** I01 signup password policy (credentialsSchema: 12..128). */
export const newPasswordSchema = z.string().min(12, { message: "password_too_short" }).max(128);

const consentFields = {
  /** Visitor accepted the terms/privacy notice of this version. */
  acceptedTerms: z.literal(true, { message: "terms_required" }),
  termsVersion: z.string().trim().min(1).max(80),
};

/**
 * Signup input. `role` is the visitor's intent used to route to onboarding; it is never
 * sent to the server as an authority claim. Admin is not a valid value.
 * `phone_otp` is the master-spec method; I01 currently ships only `email_password`.
 */
export const signupSchema = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal("email_password"),
    role: signupRoleSchema,
    email: emailSchema,
    password: newPasswordSchema,
    ...consentFields,
  }),
  z.strictObject({
    method: z.literal("phone_otp"),
    role: signupRoleSchema,
    phone: indianMobileSchema,
    ...consentFields,
  }),
]);
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal("email_password"),
    email: emailSchema,
    // Existing accounts may predate the signup policy (matches I01 loginSchema).
    password: z.string().min(1).max(128),
  }),
  z.strictObject({ method: z.literal("phone_otp"), phone: indianMobileSchema }),
]);
export type LoginInput = z.infer<typeof loginSchema>;

/** Strip spaces/dashes from pasted or autofilled codes. Never log the result. */
export const normalizeOtpInput = (raw: string): string => raw.replace(/[\s-]/g, "");

export const otpCodeSchema = z.string().regex(/^\d{6}$/, { message: "otp_format" });

export const otpVerifySchema = z.strictObject({
  challengeId: z.string().min(1).max(200),
  code: z.preprocess((v) => (typeof v === "string" ? normalizeOtpInput(v) : v), otpCodeSchema),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** Server-owned OTP challenge state. All timing comes from the server; the UI only counts down. */
export const otpChallengeSchema = z.strictObject({
  challengeId: z.string().min(1).max(200),
  channel: z.literal("sms"),
  /** Server-masked destination, e.g. "+91 ******0000". */
  maskedDestination: z.string().min(1).max(40),
  status: z.enum(["pending", "verified", "expired", "locked"]),
  expiresAt: z.iso.datetime({ offset: true }),
  resendAvailableAt: z.iso.datetime({ offset: true }),
  /** Remaining resends; 0 means resend is exhausted for this challenge. */
  resendsRemaining: z.int().nonnegative(),
  attemptsRemaining: z.int().nonnegative(),
  /** Server clock at response time, to correct client skew. */
  serverNow: z.iso.datetime({ offset: true }),
});
export type OtpChallenge = z.infer<typeof otpChallengeSchema>;

/**
 * Seconds until resend is allowed, corrected for client clock skew using `serverNow`.
 * `clientReceivedAt` is the client time when the challenge response arrived.
 */
export function secondsUntilResend(challenge: OtpChallenge, clientNow: Date, clientReceivedAt: Date): number {
  if (challenge.resendsRemaining <= 0 || challenge.status !== "pending") return Number.POSITIVE_INFINITY;
  const skewMs = clientReceivedAt.getTime() - Date.parse(challenge.serverNow);
  const serverNowMs = clientNow.getTime() - skewMs;
  const remainingMs = Date.parse(challenge.resendAvailableAt) - serverNowMs;
  return remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 1000);
}

export type SignupOutcome =
  /** Same response for new and existing accounts (no account enumeration). */
  | { kind: "received" }
  | { kind: "otp_challenge"; challenge: OtpChallenge };

export type LoginOutcome<TSession> =
  | { kind: "signed_in"; session: TSession }
  | { kind: "otp_challenge"; challenge: OtpChallenge };
