import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as CLINICAL } from "@/fixtures/clinical/world";
import { FIXTURE_ACCOUNTS, FIXTURE_SESSIONS, type FixtureScenario } from "@/fixtures/identity";
import type { GuardOutcome } from "@/modules/auth/guard";

// Integration (fe-int2): patient/doctor pages and actions use fe-b requireRole/authorizeRole, the
// public header uses getAccountSession, ops uses requireOperationsSession/authorizeOperationsSession.
// Synthetic identities only.

const auth = vi.hoisted(() => ({
  requireRole: vi.fn(),
  authorizeRole: vi.fn(),
  getAccountSession: vi.fn(),
  isFixtureAdapter: vi.fn(() => true),
}));
vi.mock("@/modules/auth/server", () => auth);
vi.mock("@/modules/auth/actions", () => ({ logoutAction: async () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { fixtureActorFor, isLoginRedirect } = await import("@/modules/auth/fixture-actors");
const { doctorSessionFrom, getDoctorSession, requireDoctorSession } = await import("@/modules/doctor/session");
const { authorizerFor, getPatientSession, requirePatientSession } = await import("@/modules/patient-dashboard/session");
const { getPublicAccount } = await import("@/components/shared/session-seam");

function identity(scenario: FixtureScenario) {
  const s = FIXTURE_SESSIONS[scenario];
  if (s.kind !== "authenticated") throw new Error(`${scenario} is not authenticated`);
  return s.identity;
}
const allowed = (scenario: FixtureScenario): GuardOutcome => ({ kind: "allowed", identity: identity(scenario), workspaces: [] });
const LOGIN: GuardOutcome = { kind: "redirect", to: "/en/login?next=%2Fen%2Fdoctor%2Fdashboard" };
const WRONG_ROLE: GuardOutcome = { kind: "redirect", to: "/en/patient/dashboard" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.isFixtureAdapter.mockReturnValue(true);
});

describe("fixture identity -> synthetic world actor", () => {
  it("maps each active doctor account to its own clinical-world doctor", () => {
    expect(fixtureActorFor(identity("doctor_active"), "doctor")).toEqual({ role: "doctor", doctorId: CLINICAL.doctorAssigned });
    expect(fixtureActorFor(identity("multi_role"), "doctor")).toEqual({ role: "doctor", doctorId: CLINICAL.doctorAssigned });
    expect(fixtureActorFor(identity("doctor_other"), "doctor")).toEqual({ role: "doctor", doctorId: CLINICAL.doctorOther });
    expect(FIXTURE_ACCOUNTS["doctor.other@example.invalid"]).toBe("doctor_other");
  });

  it("gives no actor to identities without a mapping (fixture adapters then deny everything)", () => {
    expect(fixtureActorFor(identity("admin"), "doctor")).toBeNull();
    expect(fixtureActorFor(identity("admin"), "patient")).toBeNull();
    expect(fixtureActorFor(identity("patient_complete"), "patient")).toEqual(DEFAULT_PATIENT_ACTOR);
  });

  it("treats only the sign-in redirect as signed out", () => {
    expect(isLoginRedirect(LOGIN)).toBe(true);
    expect(isLoginRedirect(WRONG_ROLE)).toBe(false);
    expect(isLoginRedirect({ kind: "denied", reason: "forbidden" })).toBe(false);
  });
});

describe("doctor session on requireRole/authorizeRole", () => {
  it("signed out -> unauthenticated, wrong role or denial -> forbidden; never a fake actor", () => {
    expect(doctorSessionFrom(LOGIN, true)).toEqual({ guard: { status: "unauthenticated" }, ctx: {}, synthetic: true });
    expect(doctorSessionFrom(WRONG_ROLE, true).guard).toEqual({ status: "forbidden" });
    expect(doctorSessionFrom({ kind: "denied", reason: "unavailable" }, false).guard).toEqual({ status: "forbidden" });
  });

  it("http mode carries the bearer-token lookup and no fixture actor", () => {
    const http = { getAccessToken: () => "t" };
    const s = doctorSessionFrom(allowed("doctor_active"), false, http);
    expect(s).toEqual({ guard: { status: "ok" }, ctx: { http }, synthetic: false });
  });

  it("server actions use authorizeRole (no redirect) and pages use requireRole with the page path", async () => {
    auth.authorizeRole.mockResolvedValue(allowed("doctor_other"));
    const s = await getDoctorSession();
    expect(auth.authorizeRole).toHaveBeenCalledWith("doctor", { locale: "en" });
    expect(s.ctx.fixtureActor).toEqual({ role: "doctor", doctorId: CLINICAL.doctorOther });

    auth.requireRole.mockResolvedValue({ kind: "denied", reason: "account_restricted" });
    expect(await requireDoctorSession("te", "/te/doctor/visits")).toEqual({ ok: false, reason: "restricted" });
    expect(auth.requireRole).toHaveBeenCalledWith("doctor", { locale: "te", path: "/te/doctor/visits" });
  });
});

describe("patient session on requireRole/authorizeRole", () => {
  it("pages: allowed -> synthetic patient; denied -> denied with the guard's reason", async () => {
    auth.requireRole.mockResolvedValue(allowed("patient_complete"));
    expect(await requirePatientSession("hi", "/hi/patient/records")).toEqual({ status: "ok", synthetic: true, fixtureActor: DEFAULT_PATIENT_ACTOR });
    // Record detail pages pass the list path, so a record ID never travels through the login URL.
    expect(auth.requireRole).toHaveBeenCalledWith("patient", { locale: "hi", path: "/hi/patient/records" });

    auth.requireRole.mockResolvedValue({ kind: "denied", reason: "account_restricted" });
    expect(await requirePatientSession("xx", "/en/patient/bookings")).toEqual({ status: "denied", reason: "account_restricted" });
    expect(auth.requireRole).toHaveBeenLastCalledWith("patient", { locale: "en", path: "/en/patient/bookings" });
  });

  it("actions and per-operation re-checks refuse anything but an allowed patient", async () => {
    auth.authorizeRole.mockResolvedValue(WRONG_ROLE);
    expect(await getPatientSession()).toEqual({ status: "unauthenticated" });
    expect(await authorizerFor()()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });

    auth.authorizeRole.mockResolvedValue(allowed("multi_role"));
    expect((await getPatientSession()).status).toBe("ok");
    expect(await authorizerFor()()).toMatchObject({ ok: true });
  });
});

describe("public header on getAccountSession", () => {
  it("signed-in account -> locale-less workspace links; anything else -> signed-out header", async () => {
    auth.getAccountSession.mockResolvedValue({
      kind: "signed_in",
      displayName: "Synthetic Multi-role I",
      role: "patient",
      dashboardHref: "/en/patient/dashboard",
      workspaces: [
        { role: "patient", href: "/en/patient/dashboard" },
        { role: "doctor", href: "/en/doctor/dashboard" },
      ],
    });
    const account = await getPublicAccount();
    expect(account?.displayName).toBe("Synthetic Multi-role I");
    expect(account?.workspaces).toEqual([
      { role: "patient", href: "/patient/dashboard" },
      { role: "doctor", href: "/doctor/dashboard" },
    ]);
    auth.getAccountSession.mockResolvedValue({ kind: "anonymous" });
    expect(await getPublicAccount()).toBeNull();
  });
});

describe("no interim guards left (static audit)", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
    return out;
  };
  const src = walk("src");

  it("no source reads the old server-env session switches", () => {
    const hits = src.filter((f) => /FIXTURE_(PATIENT|DOCTOR)_SESSION|getOperationsSession/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("every role page goes through a real guard", () => {
    const GUARD = /RouteGate|guardDoctorPage|DoctorStaticPage|requireRole|requirePatientSession|guardPatientPage|familyPage|ProviderOnboarding/;
    const pages = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"].flatMap((a) => walk(join("src", "app", "[locale]", a)).filter((f) => f.endsWith("page.tsx")));
    // Area index pages (/{locale}/doctor, /lab, ...) only redirect to the guarded dashboard.
    const isIndex = (f: string) => /\[locale\][\\/](doctor|lab|ambulance|caretaker|admin)[\\/]page\.tsx$/.test(f);
    for (const f of pages.filter(isIndex)) expect(readFileSync(f, "utf8"), f).toMatch(/redirect\(/);
    const unguarded = pages.filter((f) => !isIndex(f) && !GUARD.test(readFileSync(f, "utf8")));
    expect(pages.length).toBeGreaterThan(60);
    expect(unguarded).toEqual([]);
  });

  it("operations pages and actions resolve the session through the fe-b guards", () => {
    const ops = readFileSync("src/modules/admin/session.ts", "utf8");
    expect(ops).toMatch(/requireRole\(area/);
    expect(ops).toMatch(/authorizeRole\(area/);
    for (const f of ["src/modules/admin/action-guard.ts", "src/modules/admin/admin-actions.ts", "src/modules/admin/server-actions.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(/authorizeOperationsSession\(/);
    }
  });
});
