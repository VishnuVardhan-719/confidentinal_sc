"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fieldErrors } from "@/components/ui/form-field";
import { findDemoAccount } from "./accounts";
import { cityOf, displayNameOf, signupDetailsSchema } from "@/lib/validation/auth-signup";
import {
  DEMO_COOKIE,
  DEMO_COOKIE_MAX_AGE,
  DEMO_PROFILE_COOKIE,
  SIGNUP_HOME,
  destinationFor,
  encodeDemoProfile,
  isDemoMode,
  parseDemoRole,
} from "./auth-core";

export type DemoActionState = { error: string | null };

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DEMO_COOKIE_MAX_AGE,
});

/**
 * Demo sign-in. Server action, so Next checks the request origin. The role comes from a fixed allowlist;
 * the cookie is httpOnly so page scripts cannot change it. It still grants nothing real (see auth-core.ts).
 * A `next` field is honoured only for same-site paths that role may open.
 */
export async function startDemoSession(_prev: DemoActionState, formData: FormData): Promise<DemoActionState> {
  if (!isDemoMode()) return { error: "Demo mode is switched off on this site." };
  const role = parseDemoRole(formData.get("role"));
  if (!role) return { error: "That demo role does not exist. Pick one of the roles listed." };

  const store = await cookies();
  store.set(DEMO_COOKIE, role, cookieOptions());
  store.delete(DEMO_PROFILE_COOKIE);
  redirect(destinationFor(role, formData.get("next")));
}

/** Demo sign-in with a typed email and password from the public demo accounts list (accounts.ts). */
export async function signInWithDemoPassword(email: string, password: string, next?: string): Promise<DemoActionState> {
  if (!isDemoMode()) return { error: "Sign-in is not connected yet." };
  const account = findDemoAccount(String(email), String(password));
  if (!account) return { error: "That email and password do not match a demo account." };

  const store = await cookies();
  store.set(DEMO_COOKIE, account.role, cookieOptions());
  store.set(DEMO_PROFILE_COOKIE, encodeDemoProfile({ role: account.role, name: account.name, city: account.city }), cookieOptions());
  redirect(destinationFor(account.role, next));
}

export type DemoSignupResult =
  | { ok: true; home: string; name: string }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Demo sign-up. Re-validates the details on the server with the same schema the form used, then starts a
 * demo session for that role. Only the display name and city are kept (in an httpOnly cookie); everything
 * else is checked and discarded. Returns where to go so the form can say "Account created (demo)" first.
 */
export async function createDemoAccount(input: unknown): Promise<DemoSignupResult> {
  if (!isDemoMode()) return { ok: false, error: "Account creation is not connected yet.", fieldErrors: {} };
  const parsed = signupDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some details need attention.", fieldErrors: fieldErrors(parsed.error) };
  }
  const details = parsed.data;
  const name = displayNameOf(details);

  const store = await cookies();
  store.set(DEMO_COOKIE, details.role, cookieOptions());
  store.set(DEMO_PROFILE_COOKIE, encodeDemoProfile({ role: details.role, name, city: cityOf(details) }), cookieOptions());
  return { ok: true, home: SIGNUP_HOME[details.role], name };
}

/** Ends the demo session. Works even when demo mode has been switched off, so a stale cookie can always be cleared. */
export async function endDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  store.delete(DEMO_PROFILE_COOKIE);
  redirect("/sign-out");
}
