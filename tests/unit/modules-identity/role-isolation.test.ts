import { describe, expect, it } from "vitest";
import { accountSessionView } from "@/modules/auth/account-session";
import { decideRoleAccess, type SessionLookup } from "@/modules/auth/guard";
import { ROLES, signupRoleSchema, type Role } from "@/modules/auth/roles";
import { homePath, resolvePostAuthRedirect } from "@/modules/auth/routes";
import type { Identity, Session, Workspace } from "@/modules/auth/types";

const identity = (workspaces: Workspace[]): Identity => ({
  userId: "00000000-0000-4000-8000-0000000000aa",
  displayName: "Synthetic User",
  locale: "en",
  workspaces,
});
const activeIn = (role: Role): Identity => identity([{ role, state: "active" }]);
const lookup = (session: Session, hadSession = false): SessionLookup => ({ session: { ok: true, data: session }, hadSession });
const signedIn = (id: Identity) => lookup({ kind: "authenticated", identity: id });
const ANON = lookup({ kind: "anonymous" });

const EVIL_PATHS = [
  "//evil.example/x",
  "https://evil.example/en/patient/dashboard",
  "/\\evil.example",
  "\\\\evil.example",
  "javascript:alert(1)",
  "/%2F%2Fevil.example",
  " /en/patient/dashboard",
];

/** The login redirect's `next` must be an internal path inside the requested role root. */
function nextParam(to: string): string {
  const url = new URL(to, "https://internal.invalid");
  expect(url.origin).toBe("https://internal.invalid");
  expect(url.pathname).toBe("/en/login");
  return url.searchParams.get("next") ?? "";
}

describe("role isolation: each role stays in its own area", () => {
  for (const own of ROLES) {
    it(`${own} is allowed in /${own} and sent to its own dashboard from every other role area`, () => {
      const me = signedIn(activeIn(own));
      expect(decideRoleAccess({ ...me, role: own, locale: "en", path: `/en/${own}/dashboard` }).kind).toBe("allowed");
      for (const other of ROLES.filter((r) => r !== own)) {
        for (const sub of ["dashboard", "bookings", "settings"]) {
          const outcome = decideRoleAccess({ ...me, role: other, locale: "en", path: `/en/${other}/${sub}` });
          expect(outcome, `${own} -> /${other}/${sub}`).toEqual({ kind: "redirect", to: homePath(own, "en") });
        }
      }
    });
  }

  it("a signed-in user may only START a provider application in a category they do not hold", () => {
    const me = signedIn(activeIn("patient"));
    expect(decideRoleAccess({ ...me, role: "doctor", locale: "en", path: "/en/doctor/onboarding" }).kind).toBe("allowed");
    expect(decideRoleAccess({ ...me, role: "admin", locale: "en", path: "/en/admin/onboarding" })).toEqual({
      kind: "redirect",
      to: "/en/patient/dashboard",
    });
  });

  it("an admin membership that is not active is denied, not redirected into admin", () => {
    const me = signedIn(identity([{ role: "admin", state: "pending_review" }]));
    expect(decideRoleAccess({ ...me, role: "admin", locale: "en", path: "/en/admin/providers" })).toEqual({
      kind: "denied",
      reason: "forbidden",
    });
  });

  it("an incomplete patient is sent to patient onboarding, never to another role", () => {
    const me = signedIn(identity([{ role: "patient", state: "onboarding_incomplete" }]));
    expect(decideRoleAccess({ ...me, role: "doctor", locale: "te", path: "/te/doctor/dashboard" })).toEqual({
      kind: "redirect",
      to: "/te/patient/onboarding",
    });
    expect(decideRoleAccess({ ...me, role: "patient", locale: "te", path: "/te/patient/bookings" })).toEqual({
      kind: "redirect",
      to: "/te/patient/onboarding",
    });
  });

  it("a multi-role user entering a role they do not hold goes to the workspace picker", () => {
    const me = signedIn(identity([{ role: "patient", state: "active" }, { role: "doctor", state: "active" }]));
    expect(decideRoleAccess({ ...me, role: "lab", locale: "en", path: "/en/lab/dashboard" })).toEqual({
      kind: "redirect",
      to: "/en/workspace/select",
    });
  });
});

describe("unauthenticated and restricted users cannot enter any role area", () => {
  for (const role of ROLES) {
    it(`anonymous -> /${role} redirects to login with a safe return path`, () => {
      const outcome = decideRoleAccess({ ...ANON, role, locale: "en", path: `/en/${role}/dashboard` });
      expect(outcome.kind).toBe("redirect");
      if (outcome.kind === "redirect") expect(nextParam(outcome.to)).toBe(`/en/${role}/dashboard`);
    });
  }

  it("an expired session says so on the login page", () => {
    const outcome = decideRoleAccess({ ...lookup({ kind: "anonymous" }, true), role: "lab", locale: "hi" });
    expect(outcome).toEqual({ kind: "redirect", to: "/hi/login?next=%2Fhi%2Flab%2Fdashboard&reason=session_expired" });
  });

  it("restricted accounts and failed session lookups are denied everywhere", () => {
    const restricted = lookup({ kind: "restricted", reason: "account_disabled" });
    for (const role of ROLES) {
      expect(decideRoleAccess({ ...restricted, role, locale: "en" })).toEqual({ kind: "denied", reason: "account_restricted" });
      const failed: SessionLookup = { session: { ok: false, error: { code: "network", message: "x" } } as never, hadSession: false };
      expect(decideRoleAccess({ ...failed, role, locale: "en" })).toEqual({ kind: "denied", reason: "unavailable" });
    }
  });
});

describe("return paths cannot become open redirects", () => {
  for (const evil of EVIL_PATHS) {
    it(`login next for ${JSON.stringify(evil)} stays internal`, () => {
      const outcome = decideRoleAccess({ ...ANON, role: "patient", locale: "en", path: evil });
      expect(outcome.kind).toBe("redirect");
      if (outcome.kind !== "redirect") return;
      const next = nextParam(outcome.to);
      expect(next).toBe("/en/patient/dashboard");
    });

    it(`post-login ignores ${JSON.stringify(evil)}`, () => {
      expect(resolvePostAuthRedirect(activeIn("doctor"), evil, "en")).toBe("/en/doctor/dashboard");
    });
  }

  it("a return path into another role's area is replaced by the user's own dashboard", () => {
    expect(resolvePostAuthRedirect(activeIn("lab"), "/en/admin/providers", "en")).toBe("/en/lab/dashboard");
    expect(resolvePostAuthRedirect(activeIn("lab"), "/en/lab/bookings", "en")).toBe("/en/lab/bookings");
  });

  it("a return path for another role root is never passed through as login next", () => {
    const outcome = decideRoleAccess({ ...ANON, role: "patient", locale: "en", path: "/en/admin/providers" });
    expect(outcome.kind === "redirect" && nextParam(outcome.to)).toBe("/en/patient/dashboard");
  });
});

describe("post-login lands on the correct role dashboard", () => {
  for (const role of ROLES) {
    it(`${role} lands on /${role}/dashboard`, () => {
      expect(resolvePostAuthRedirect(activeIn(role), undefined, "en")).toBe(`/en/${role}/dashboard`);
      expect(resolvePostAuthRedirect(activeIn(role), "/en/login", "en")).toBe(`/en/${role}/dashboard`);
    });
  }

  it("there is no public admin signup", () => {
    expect(signupRoleSchema.safeParse("admin").success).toBe(false);
    for (const role of ROLES.filter((r) => r !== "admin")) expect(signupRoleSchema.safeParse(role).success).toBe(true);
  });
});

describe("getAccountSession view is non-PHI", () => {
  it("exposes only display name, role(s) and dashboard link", () => {
    const view = accountSessionView(
      signedIn({ ...activeIn("doctor"), workspaces: [{ role: "doctor", state: "active", providerId: "00000000-0000-4000-8000-0000000000bb" }] }),
      "en",
    );
    expect(view).toEqual({
      kind: "signed_in",
      displayName: "Synthetic User",
      role: "doctor",
      roles: ["doctor"],
      dashboardHref: "/en/doctor/dashboard",
      workspaces: [{ role: "doctor", href: "/en/doctor/dashboard" }],
    });
    expect(JSON.stringify(view)).not.toMatch(/0000-4000|userId|providerId|token|@/);
  });

  it("multi-role users get the workspace picker and no single role", () => {
    const view = accountSessionView(signedIn(identity([{ role: "doctor", state: "active" }, { role: "patient", state: "active" }])), "hi");
    expect(view).toMatchObject({ kind: "signed_in", role: null, roles: ["patient", "doctor"], dashboardHref: "/hi/workspace/select" });
    expect(view.kind === "signed_in" && view.workspaces).toEqual([
      { role: "patient", href: "/hi/patient/dashboard" },
      { role: "doctor", href: "/hi/doctor/dashboard" },
    ]);
  });

  it("links incomplete workspaces to onboarding and hides a non-active admin workspace", () => {
    const view = accountSessionView(
      signedIn(identity([{ role: "lab", state: "onboarding_incomplete" }, { role: "admin", state: "pending_review" }])),
      "en",
    );
    expect(view.kind === "signed_in" && view.workspaces).toEqual([{ role: "lab", href: "/en/lab/onboarding" }]);
  });

  it("maps anonymous, restricted and failed lookups without guessing", () => {
    expect(accountSessionView(ANON, "en")).toEqual({ kind: "anonymous" });
    expect(accountSessionView(lookup({ kind: "restricted", reason: "account_disabled" }), "en")).toEqual({ kind: "restricted" });
    expect(accountSessionView({ session: { ok: false, error: { code: "network", message: "x" } } as never }, "en")).toEqual({
      kind: "unavailable",
    });
  });
});
