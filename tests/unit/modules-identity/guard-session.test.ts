import { describe, expect, it } from "vitest";
import { decideRoleAccess, decideSessionAccess } from "@/modules/auth/guard";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessMaxAge,
  clearSession,
  hadSession,
  readAccessToken,
  sessionCookieOptions,
  writeSession,
  type CookieWriter,
  type SessionCookieOptions,
} from "@/modules/auth/session-cookie";
import { workspaceChoices } from "@/modules/auth/workspaces";
import type { Session } from "@/modules/auth/types";
import { FIXTURE_SESSIONS } from "@/fixtures/identity";

const okSession = (s: Session) => ({ ok: true as const, data: s });

describe("decideRoleAccess (requireRole core)", () => {
  it("redirects anonymous users to login with next, and flags an expired session", () => {
    expect(decideRoleAccess({ session: okSession({ kind: "anonymous" }), hadSession: false, role: "doctor", locale: "te", path: "/te/doctor/visits" })).toEqual({
      kind: "redirect",
      to: "/te/login?next=%2Fte%2Fdoctor%2Fvisits",
    });
    expect(decideRoleAccess({ session: okSession({ kind: "anonymous" }), hadSession: true, role: "doctor", locale: "en" })).toEqual({
      kind: "redirect",
      to: "/en/login?next=%2Fen%2Fdoctor%2Fdashboard&reason=session_expired",
    });
  });

  it("sends the wrong role to its own dashboard (PHASE3-B); restricted accounts stay denied", () => {
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "admin", locale: "en" })).toEqual({
      kind: "redirect",
      to: "/en/patient/dashboard",
    });
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.account_disabled), hadSession: true, role: "patient", locale: "en" })).toEqual({
      kind: "denied",
      reason: "account_restricted",
    });
  });

  it("fails closed when the session lookup is unavailable", () => {
    expect(decideRoleAccess({ session: { ok: false, error: { code: "unavailable" } }, hadSession: true, role: "patient", locale: "en" })).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
  });

  it("allows the right role and returns only that role's workspaces", () => {
    const outcome = decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.multi_role), hadSession: true, role: "doctor", locale: "en", path: "/en/doctor/visits" });
    expect(outcome.kind).toBe("allowed");
    if (outcome.kind === "allowed") expect(outcome.workspaces.map((w) => w.role)).toEqual(["doctor"]);
  });

  it("sends incomplete workspaces to onboarding and ignores paths outside the role root", () => {
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_new), hadSession: true, role: "patient", locale: "en", path: "/en/patient/bookings" })).toEqual({
      kind: "redirect",
      to: "/en/patient/onboarding",
    });
    // A caller passing another root's path cannot widen access; the role dashboard is checked instead.
    const outcome = decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "patient", locale: "en", path: "/en/admin/audit" });
    expect(outcome.kind).toBe("allowed");
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "patient", locale: "en", path: "https://evil.example" }).kind).toBe("allowed");
  });

  it("lets a signed-in user start a provider application without a workspace", () => {
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "lab", locale: "en", path: "/en/lab/onboarding" }).kind).toBe("allowed");
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "lab", locale: "en", path: "/en/lab/orders" })).toEqual({ kind: "redirect", to: "/en/patient/dashboard" });
    expect(decideRoleAccess({ session: okSession(FIXTURE_SESSIONS.patient_complete), hadSession: true, role: "admin", locale: "en", path: "/en/admin/onboarding" })).toEqual({ kind: "redirect", to: "/en/patient/dashboard" });
  });
});

describe("decideSessionAccess (shared private routes)", () => {
  it("requires a signed-in, unrestricted user", () => {
    expect(decideSessionAccess({ session: okSession({ kind: "anonymous" }), hadSession: false, locale: "en", path: "/en/workspace/select" })).toEqual({
      kind: "redirect",
      to: "/en/login?next=%2Fen%2Fworkspace%2Fselect",
    });
    expect(decideSessionAccess({ session: okSession(FIXTURE_SESSIONS.account_disabled), hadSession: true, locale: "en" }).kind).toBe("denied");
    expect(decideSessionAccess({ session: okSession(FIXTURE_SESSIONS.admin), hadSession: true, locale: "en" }).kind).toBe("allowed");
  });
});

function fakeStore() {
  const jar = new Map<string, { value: string; options?: SessionCookieOptions }>();
  const store: CookieWriter = {
    get: (name) => (jar.has(name) ? { value: jar.get(name)!.value } : undefined),
    set: (name, value, options) => jar.set(name, { value, options }),
    delete: (name) => jar.delete(name),
  };
  return { store, jar };
}

describe("session cookies", () => {
  it("writes httpOnly SameSite=Lax cookies, Secure in production", () => {
    const { store, jar } = fakeStore();
    expect(writeSession(store, { accessToken: "a.b.c", refreshToken: "r", expiresAt: null }, { NODE_ENV: "production" })).toBe(true);
    const access = jar.get(ACCESS_COOKIE)!;
    expect(access.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(jar.get(REFRESH_COOKIE)?.value).toBe("r");
    expect(sessionCookieOptions(10, { NODE_ENV: "development" }).secure).toBe(false);
  });

  it("refuses unusable tokens and clears both cookies", () => {
    const { store, jar } = fakeStore();
    expect(writeSession(store, { accessToken: "has space", refreshToken: "r", expiresAt: null }, {})).toBe(false);
    expect(jar.size).toBe(0);
    writeSession(store, { accessToken: "a", refreshToken: "r", expiresAt: null }, {});
    expect(readAccessToken(store)).toBe("a");
    expect(hadSession(store)).toBe(true);
    clearSession(store);
    expect(readAccessToken(store)).toBeNull();
    expect(hadSession(store)).toBe(false);
  });

  it("bounds the access cookie lifetime by the server expiry", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(accessMaxAge(now.getTime() / 1000 + 600, now)).toBe(600);
    expect(accessMaxAge(now.getTime() / 1000 - 5, now)).toBe(0);
    expect(accessMaxAge(now.getTime() / 1000 + 10 * 86_400, now)).toBe(86_400);
    expect(accessMaxAge(null, now)).toBe(3600);
  });
});

describe("workspace choices", () => {
  it("links each workspace to a route its state allows", () => {
    const s = FIXTURE_SESSIONS.lab_pending_review;
    if (s.kind !== "authenticated") throw new Error("fixture");
    const [lab] = workspaceChoices(s.identity, "hi");
    expect(lab).toMatchObject({ role: "lab", href: "/hi/lab/dashboard", organizationName: "Synthetic Diagnostics Org" });
    expect(lab.providerStatus?.labelKey).toBe("onboarding.providerStatus.under_review");
    const d = FIXTURE_SESSIONS.doctor_draft;
    if (d.kind !== "authenticated") throw new Error("fixture");
    expect(workspaceChoices(d.identity, "en").map((c) => c.href)).toEqual(["/en/patient/onboarding", "/en/doctor/onboarding"]);
  });
});
