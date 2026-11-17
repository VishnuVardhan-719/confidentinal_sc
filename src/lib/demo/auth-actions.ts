"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, DEMO_COOKIE_MAX_AGE, DEMO_HOME, isDemoMode, parseDemoRole } from "./auth-core";

export type DemoActionState = { error: string | null };

/**
 * Demo sign-in. Server action, so Next checks the request origin. The role comes from a fixed allowlist;
 * the cookie is httpOnly so page scripts cannot change it. It still grants nothing real (see auth-core.ts).
 */
export async function startDemoSession(_prev: DemoActionState, formData: FormData): Promise<DemoActionState> {
  if (!isDemoMode()) return { error: "Demo mode is switched off on this site." };
  const role = parseDemoRole(formData.get("role"));
  if (!role) return { error: "That demo role does not exist. Pick one of the roles listed." };

  const store = await cookies();
  store.set(DEMO_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_COOKIE_MAX_AGE,
  });
  redirect(DEMO_HOME[role]);
}

/** Ends the demo session. Works even when demo mode has been switched off, so a stale cookie can always be cleared. */
export async function endDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect("/sign-out");
}
