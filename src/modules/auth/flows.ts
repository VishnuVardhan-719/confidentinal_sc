import type { ApiError, ApiResult } from "@/lib/api/result";
import type { AuthApi } from "./api";
import { authErrorKey, fieldMessageKeys, type AuthFlow } from "./errors";
import { formChecked, formLocale, formString, formTrimmed } from "./form-data";
import { isLocale, signupRoleSchema, type Locale, type SignupRole } from "./roles";
import { onboardingPath, resolvePostAuthRedirect, canAccessRoute, loginPath } from "./routes";
import type { OtpChallenge } from "./schemas";
import type { Session, SessionTokens } from "./types";

/**
 * Auth flow cores used by the server actions in actions.ts. Pure apart from injected
 * dependencies (module API, cookie writer, session lookup) so every branch is unit-tested.
 * Passwords and OTP codes are never echoed back into state.
 */

export type SafeValues = { email?: string; phone?: string; role?: SignupRole };

export type AuthFormState =
  | { status: "idle" }
  | {
      status: "error";
      errorKey: string;
      fieldErrors: Record<string, string>;
      values: SafeValues;
      retryAfterSeconds?: number;
    }
  | {
      status: "otp";
      purpose: "signup" | "login";
      challenge: OtpChallenge;
      role: SignupRole | null;
      next: string | null;
      errorKey?: string;
      retryAfterSeconds?: number;
    }
  | { status: "check_email"; email: string }
  | { status: "redirect"; to: string };

export const IDLE: AuthFormState = { status: "idle" };

export type AuthDeps = {
  api: AuthApi;
  /** Persist tokens in httpOnly cookies. Returns false if they were unusable. */
  writeTokens: (tokens: SessionTokens) => boolean;
  clearTokens: () => void;
  /** Look up the session for freshly issued tokens. */
  sessionFor: (accessToken: string) => Promise<ApiResult<Session>>;
};

const errorState = (error: ApiError, flow: AuthFlow, values: SafeValues): AuthFormState => {
  const state: AuthFormState = { status: "error", errorKey: authErrorKey(error, flow), fieldErrors: fieldMessageKeys(error.fields), values };
  if (error.retryAfterSeconds !== undefined) state.retryAfterSeconds = error.retryAfterSeconds;
  return state;
};

const nextParam = (fd: FormData): string | null => formString(fd, "next", 2048) ?? null;

async function completeSignIn(
  deps: AuthDeps,
  tokens: SessionTokens,
  locale: Locale,
  next: string | null,
  intent: SignupRole | null,
  flow: AuthFlow,
): Promise<AuthFormState> {
  if (!deps.writeTokens(tokens)) return errorState({ code: "unavailable" }, flow, {});
  const session = await deps.sessionFor(tokens.accessToken);
  if (!session.ok) return errorState(session.error, flow, {});
  if (session.data.kind === "restricted") {
    deps.clearTokens();
    return errorState({ code: "forbidden" }, flow, {});
  }
  if (session.data.kind !== "authenticated") {
    deps.clearTokens();
    return errorState({ code: "unavailable" }, flow, {});
  }
  const identity = session.data.identity;
  // Role intent from signup only steers navigation; access is still decided by the session.
  if (intent && next === null) {
    const target = onboardingPath(intent, locale);
    if (canAccessRoute(session.data, target).allowed) return { status: "redirect", to: target };
  }
  return { status: "redirect", to: resolvePostAuthRedirect(identity, next, locale) };
}

/* ---------------- login ---------------- */

export function readLoginForm(fd: FormData) {
  const method = formString(fd, "method", 32);
  const input =
    method === "phone_otp"
      ? { method, phone: formTrimmed(fd, "phone", 20) }
      : { method: "email_password", email: formTrimmed(fd, "email", 254), password: formString(fd, "password", 128) };
  return { input, locale: formLocale(fd), next: nextParam(fd) };
}

export async function runLogin(deps: AuthDeps, fd: FormData): Promise<AuthFormState> {
  const { input, locale, next } = readLoginForm(fd);
  const values: SafeValues = "email" in input ? { email: input.email } : { phone: input.phone };
  const result = await deps.api.login(input as Parameters<AuthApi["login"]>[0]);
  if (!result.ok) return errorState(result.error, "login", values);
  if (result.data.kind === "otp_challenge") {
    return { status: "otp", purpose: "login", challenge: result.data.challenge, role: null, next };
  }
  return completeSignIn(deps, result.data.session, locale, next, null, "login");
}

/* ---------------- signup ---------------- */

export function readSignupForm(fd: FormData) {
  const method = formString(fd, "method", 32);
  const role = formString(fd, "role", 16);
  const consent = {
    role,
    acceptedTerms: formChecked(fd, "acceptedTerms") ? true : undefined,
    termsVersion: formTrimmed(fd, "termsVersion", 80),
  };
  const input =
    method === "phone_otp"
      ? { method, phone: formTrimmed(fd, "phone", 20), ...consent }
      : { method: "email_password", email: formTrimmed(fd, "email", 254), password: formString(fd, "password", 128), ...consent };
  const parsedRole = signupRoleSchema.safeParse(role);
  return { input, role: parsedRole.success ? parsedRole.data : null, locale: formLocale(fd), next: nextParam(fd) };
}

export async function runSignup(deps: AuthDeps, fd: FormData): Promise<AuthFormState> {
  const { input, role, next } = readSignupForm(fd);
  const values: SafeValues = { role: role ?? undefined, ...("email" in input ? { email: input.email } : { phone: input.phone }) };
  const result = await deps.api.signup(input as Parameters<AuthApi["signup"]>[0]);
  if (!result.ok) return errorState(result.error, "signup", values);
  if (result.data.kind === "otp_challenge") {
    return { status: "otp", purpose: "signup", challenge: result.data.challenge, role, next };
  }
  // Same message whether or not the account already existed (no enumeration).
  return { status: "check_email", email: values.email ?? "" };
}

/* ---------------- OTP ---------------- */

function readOtpContext(fd: FormData) {
  const purpose = formString(fd, "purpose", 16) === "signup" ? "signup" : "login";
  const role = signupRoleSchema.safeParse(formString(fd, "role", 16));
  return {
    challengeId: formString(fd, "challengeId", 200) ?? "",
    code: formString(fd, "code", 32) ?? "",
    purpose: purpose as "signup" | "login",
    role: role.success ? role.data : null,
    locale: formLocale(fd),
    next: nextParam(fd),
  };
}

export async function runVerifyOtp(deps: AuthDeps, fd: FormData, current: OtpChallenge | null): Promise<AuthFormState> {
  const ctx = readOtpContext(fd);
  const result = await deps.api.verifyOtp({ challengeId: ctx.challengeId, code: ctx.code });
  if (!result.ok) {
    if (current === null) return errorState(result.error, "otp_verify", {});
    const state: AuthFormState = {
      status: "otp",
      purpose: ctx.purpose,
      challenge: current,
      role: ctx.role,
      next: ctx.next,
      errorKey: authErrorKey(result.error, "otp_verify"),
    };
    if (result.error.retryAfterSeconds !== undefined) state.retryAfterSeconds = result.error.retryAfterSeconds;
    return state;
  }
  return completeSignIn(deps, result.data.session, ctx.locale, ctx.next, ctx.purpose === "signup" ? ctx.role : null, "otp_verify");
}

export async function runResendOtp(deps: AuthDeps, fd: FormData, current: OtpChallenge | null): Promise<AuthFormState> {
  const ctx = readOtpContext(fd);
  const result = await deps.api.resendOtp(ctx.challengeId);
  if (result.ok) return { status: "otp", purpose: ctx.purpose, challenge: result.data, role: ctx.role, next: ctx.next };
  if (current === null) return errorState(result.error, "otp_resend", {});
  const state: AuthFormState = {
    status: "otp",
    purpose: ctx.purpose,
    challenge: current,
    role: ctx.role,
    next: ctx.next,
    errorKey: authErrorKey(result.error, "otp_resend"),
  };
  if (result.error.retryAfterSeconds !== undefined) state.retryAfterSeconds = result.error.retryAfterSeconds;
  return state;
}

/* ---------------- logout ---------------- */

/** Always clears cookies, even if the server call fails (tokens must not linger). */
export async function runLogout(deps: Pick<AuthDeps, "api" | "clearTokens">, fd: FormData): Promise<AuthFormState> {
  const locale = formLocale(fd);
  try {
    await deps.api.logout();
  } finally {
    deps.clearTokens();
  }
  return { status: "redirect", to: loginPath(isLocale(locale) ? locale : "en", undefined, "signed_out") };
}
