import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/modules/auth/redirect";
import {
  canAccessRoute,
  homePath,
  landingPathFor,
  onboardingPath,
  resolvePostAuthRedirect,
  ROLE_HOME_PATH,
} from "@/modules/auth/routes";
import { ROLES } from "@/modules/auth/roles";
import type { Identity, Session } from "@/modules/auth/types";
import { FIXTURE_SESSIONS } from "@/fixtures/identity";

const FALLBACK = "/en";

describe("safeRedirect", () => {
  it("keeps internal paths", () => {
    expect(safeRedirect("/en/patient/dashboard", FALLBACK)).toBe("/en/patient/dashboard");
    expect(safeRedirect("/te/doctors?pin=500001#top", FALLBACK)).toBe("/te/doctors?pin=500001#top");
    expect(safeRedirect("/en/patient/../doctor/dashboard", FALLBACK)).toBe("/en/doctor/dashboard");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/en",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "en/patient",
    " /en",
    "/en\n/patient",
    "/\t/evil.example",
    "/api/auth/logout",
    "/API/auth/logout",
    "",
  ])("rejects %j", (target) => {
    expect(safeRedirect(target, FALLBACK)).toBe(FALLBACK);
  });

  it("rejects non-strings and overlong values", () => {
    expect(safeRedirect(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeRedirect(["/en"], FALLBACK)).toBe(FALLBACK);
    expect(safeRedirect(`/${"a".repeat(3000)}`, FALLBACK)).toBe(FALLBACK);
  });
});

describe("role home routes", () => {
  it("maps every role to its dashboard with locale", () => {
    for (const role of ROLES) expect(ROLE_HOME_PATH[role]).toBe(`/${role}/dashboard`);
    expect(homePath("lab", "te")).toBe("/te/lab/dashboard");
    expect(onboardingPath("doctor", "hi")).toBe("/hi/doctor/onboarding");
    expect(onboardingPath("admin")).toBe("/en/admin/dashboard");
  });
});

const auth = (workspaces: Identity["workspaces"]): Session => ({
  kind: "authenticated",
  identity: { userId: "00000000-0000-4000-8000-000000000999", displayName: "Synthetic", locale: "en", workspaces },
});

describe("canAccessRoute", () => {
  it("public routes are open to everyone", () => {
    for (const path of ["/", "/en", "/en/doctors", "/te/emergency", "/en/login"]) {
      expect(canAccessRoute({ kind: "anonymous" }, path)).toEqual({ allowed: true });
    }
  });

  it("anonymous users are sent to login with an encoded return path", () => {
    expect(canAccessRoute({ kind: "anonymous" }, "/te/patient/bookings")).toEqual({
      allowed: false,
      reason: "unauthenticated",
      redirectTo: "/te/login?next=%2Fte%2Fpatient%2Fbookings",
    });
    expect(canAccessRoute({ kind: "anonymous" }, "/en/workspace/select").allowed).toBe(false);
  });

  it("disabled accounts get no private routes", () => {
    expect(canAccessRoute(FIXTURE_SESSIONS.account_disabled, "/en/patient/dashboard")).toMatchObject({ allowed: false, reason: "account_restricted" });
    expect(canAccessRoute(FIXTURE_SESSIONS.account_disabled, "/en/account/security").allowed).toBe(false);
  });

  it("denies other roles' workspaces without revealing anything", () => {
    const patient = FIXTURE_SESSIONS.patient_complete;
    expect(canAccessRoute(patient, "/en/patient/bookings")).toEqual({ allowed: true });
    expect(canAccessRoute(patient, "/en/admin/providers")).toEqual({ allowed: false, reason: "forbidden", redirectTo: null });
    expect(canAccessRoute(patient, "/en/doctor/dashboard")).toEqual({ allowed: false, reason: "forbidden", redirectTo: null });
  });

  it("cannot be bypassed with case, encoding, dot segments or missing locale", () => {
    const patient = FIXTURE_SESSIONS.patient_complete;
    for (const path of ["/en/ADMIN/providers", "/en/%61dmin/providers", "/en/patient/../admin/audit", "/admin/dashboard", "/en/patient/%2e%2e/admin"]) {
      expect(canAccessRoute(patient, path).allowed, path).toBe(false);
    }
    expect(canAccessRoute(patient, "//evil.example/admin")).toMatchObject({ allowed: false, reason: "invalid_path" });
  });

  it("incomplete workspaces reach setup pages only", () => {
    const s = FIXTURE_SESSIONS.patient_new;
    expect(canAccessRoute(s, "/en/patient/onboarding").allowed).toBe(true);
    expect(canAccessRoute(s, "/en/patient").allowed).toBe(true);
    expect(canAccessRoute(s, "/en/patient/health-profile").allowed).toBe(true);
    expect(canAccessRoute(s, "/en/patient/bookings/new")).toEqual({
      allowed: false,
      reason: "onboarding_required",
      redirectTo: "/en/patient/onboarding",
    });
    // Unknown state (HTTP /me lacks questionnaire status) fails closed like incomplete.
    expect(canAccessRoute(auth([{ role: "patient", state: "unknown" }]), "/en/patient/bookings").allowed).toBe(false);
  });

  it("patients are not affected by the provider approval gate", () => {
    const pendingPatient = auth([{ role: "patient", state: "pending_review" }]);
    expect(canAccessRoute(pendingPatient, "/en/patient/dashboard").allowed).toBe(true);
    const newPatient = FIXTURE_SESSIONS.patient_new;
    expect(canAccessRoute(newPatient, "/en/patient/onboarding").allowed).toBe(true);
    expect(canAccessRoute(FIXTURE_SESSIONS.patient_complete, "/en/patient/dashboard").allowed).toBe(true);
    expect(canAccessRoute(FIXTURE_SESSIONS.admin, "/en/admin/dashboard").allowed).toBe(true);
    expect(canAccessRoute(FIXTURE_SESSIONS.doctor_active, "/en/doctor/dashboard").allowed).toBe(true);
  });

  it("pending review and suspended providers are limited", () => {
    const lab = FIXTURE_SESSIONS.lab_pending_review;
    // Awaiting the admin: every lab page, dashboard and onboarding included, leads only to the "request sent" page.
    for (const path of ["/en/lab/dashboard", "/en/lab/onboarding", "/en/lab/orders", "/en/lab/settings", "/en/lab/support"]) {
      expect(canAccessRoute(lab, path), path).toMatchObject({ allowed: false, reason: "workspace_restricted", redirectTo: "/en/workspace/pending?role=lab" });
    }
    expect(landingPathFor((lab as { identity: Identity }).identity, "te")).toBe("/te/workspace/pending?role=lab");
    // The pending page itself is a shared private page: any signed-in user may open it.
    expect(canAccessRoute(lab, "/en/workspace/pending").allowed).toBe(true);
    const care = FIXTURE_SESSIONS.caretaker_suspended;
    expect(canAccessRoute(care, "/en/caretaker/support").allowed).toBe(true);
    expect(canAccessRoute(care, "/en/caretaker/onboarding").allowed).toBe(false);
    expect(canAccessRoute(care, "/en/caretaker/assignments").allowed).toBe(false);
  });

  it("admin access needs an active admin workspace", () => {
    expect(canAccessRoute(FIXTURE_SESSIONS.admin, "/en/admin/providers").allowed).toBe(true);
    expect(canAccessRoute(auth([{ role: "admin", state: "unknown" }]), "/en/admin/dashboard").allowed).toBe(false);
  });
});

describe("post-auth redirect", () => {
  const identityOf = (s: Session): Identity => {
    if (s.kind !== "authenticated") throw new Error("fixture must be authenticated");
    return s.identity;
  };

  it("lands single-role users on home/onboarding and multi-role users on workspace select", () => {
    expect(landingPathFor(identityOf(FIXTURE_SESSIONS.patient_complete))).toBe("/en/patient/dashboard");
    expect(landingPathFor(identityOf(FIXTURE_SESSIONS.patient_new), "te")).toBe("/te/patient/onboarding");
    expect(landingPathFor(identityOf(FIXTURE_SESSIONS.multi_role))).toBe("/en/workspace/select");
  });

  it("honours only internal, permitted, non-auth return paths", () => {
    const patient = identityOf(FIXTURE_SESSIONS.patient_complete);
    expect(resolvePostAuthRedirect(patient, "/en/patient/bookings")).toBe("/en/patient/bookings");
    expect(resolvePostAuthRedirect(patient, "https://evil.example")).toBe("/en/patient/dashboard");
    expect(resolvePostAuthRedirect(patient, "/en/admin/audit")).toBe("/en/patient/dashboard");
    expect(resolvePostAuthRedirect(patient, "/en/login")).toBe("/en/patient/dashboard");
    expect(resolvePostAuthRedirect(patient, null)).toBe("/en/patient/dashboard");
  });
});
