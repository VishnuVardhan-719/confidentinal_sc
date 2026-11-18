"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthApi } from "./index";
import { runLogin, runLogout, runResendOtp, runSignup, runVerifyOtp, type AuthDeps, type AuthFormState } from "./flows";
import { clearSession, readAccessToken, writeSession } from "./session-cookie";
import type { OtpChallenge } from "./schemas";

/**
 * Server actions for auth forms. Thin wrappers: build per-request deps, run the tested
 * flow core, then redirect on success. Tokens go only into httpOnly cookies.
 * Use with React `useActionState(action, IDLE)`.
 */

function apiOrigin(): string | undefined {
  const raw = process.env.APP_ORIGIN;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

async function deps(): Promise<AuthDeps> {
  const store = await cookies();
  const token = readAccessToken(store);
  const baseUrl = apiOrigin();
  return {
    api: getAuthApi({ http: { baseUrl, getAccessToken: () => token }, fixture: { accessToken: token } }),
    writeTokens: (tokens) => writeSession(store, tokens),
    clearTokens: () => clearSession(store),
    sessionFor: (accessToken) =>
      getAuthApi({ http: { baseUrl, getAccessToken: () => accessToken }, fixture: { accessToken } }).getSession(),
  };
}

const finish = (state: AuthFormState): AuthFormState => {
  if (state.status === "redirect") redirect(state.to);
  return state;
};

const challengeOf = (state: AuthFormState): OtpChallenge | null => (state.status === "otp" ? state.challenge : null);

export async function loginAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  return finish(await runLogin(await deps(), fd));
}

export async function signupAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  return finish(await runSignup(await deps(), fd));
}

export async function verifyOtpAction(prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  return finish(await runVerifyOtp(await deps(), fd, challengeOf(prev)));
}

export async function resendOtpAction(prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  return finish(await runResendOtp(await deps(), fd, challengeOf(prev)));
}

export async function logoutAction(fd: FormData): Promise<void> {
  finish(await runLogout(await deps(), fd));
}

/**
 * Single entry point for the auth forms so one `useActionState` drives the whole flow
 * (credentials -> OTP -> verify/resend) and still works as a plain form post without JS.
 * The `intent` field only selects the step; every step re-validates its own input.
 */
export async function authStepAction(prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  switch (fd.get("intent")) {
    case "login":
      return loginAction(prev, fd);
    case "signup":
      return signupAction(prev, fd);
    case "verify":
      return verifyOtpAction(prev, fd);
    case "resend":
      return resendOtpAction(prev, fd);
    default:
      return prev;
  }
}
