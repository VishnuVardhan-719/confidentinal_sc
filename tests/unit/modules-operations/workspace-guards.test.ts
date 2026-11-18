import { describe, expect, it } from "vitest";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { decideWorkspaceAccess, loginRedirectPath, safeInternalPath, type GuardSession } from "@/modules/admin/access";
import { adminNavigation, decideAdminRoute } from "@/modules/admin/routes";
import {
  belongsToWorkspace,
  listWorkspaces,
  parseWorkspaceKey,
  resolveWorkspace,
  scopeToWorkspace,
  switchWorkspace,
  toAmbulanceActor,
  toCareActor,
  toLabActor,
  type WorkspaceMembership,
} from "@/modules/admin/workspace";
import { decideAmbulanceRoute } from "@/modules/ambulance/routes";
import { decideCaretakerRoute, caretakerNavigation } from "@/modules/caretaker/routes";
import { decideLabRoute, labNavigation } from "@/modules/lab/routes";

const session = (memberships: WorkspaceMembership[]): GuardSession => ({ profileId: memberships[0].profileId, memberships });

describe("workspace switcher", () => {
  it("lists only active memberships, one per provider, never a combined option", () => {
    const options = listWorkspaces(W.multiLabManager, "lab");
    expect(options.map((w) => w.key)).toEqual(["lab:fx-lab-provider-9", "lab:fx-lab-provider-1"]); // sorted by display name
    expect(options).toHaveLength(2);
    expect(options.some((w) => w.providerId === "fx-lab-provider-8")).toBe(false);
    expect(listWorkspaces([...W.labManager, ...W.labManager], "lab")).toHaveLength(1);
    expect(listWorkspaces(W.labManager, "ambulance")).toEqual([]);
  });

  it("requires a choice with several workspaces and no valid selection", () => {
    expect(resolveWorkspace(W.multiLabManager, "lab", undefined).kind).toBe("choose");
    expect(resolveWorkspace(W.multiLabManager, "lab", "lab:not-mine").kind).toBe("choose");
    expect(resolveWorkspace(W.multiLabManager, "lab", "lab:fx-lab-provider-8").kind).toBe("choose"); // disabled membership
    const picked = resolveWorkspace(W.multiLabManager, "lab", "lab:fx-lab-provider-9");
    expect(picked.kind === "selected" && picked.workspace.providerId).toBe("fx-lab-provider-9");
    const single = resolveWorkspace(W.labManager, "lab", "garbage<script>");
    expect(single.kind === "selected" && single.workspace.providerId).toBe("fx-lab-provider-1");
    expect(resolveWorkspace(W.labManager, "caretaker", undefined).kind).toBe("none");
  });

  it("switching only targets an active membership and invalidates client state", () => {
    const sw = switchWorkspace(W.multiLabManager, "lab", "lab:fx-lab-provider-9");
    expect(sw).toMatchObject({ ok: true, cookie: { name: "scv_ws_lab", value: "lab:fx-lab-provider-9" }, clearClientState: true });
    expect(switchWorkspace(W.multiLabManager, "lab", "lab:fx-lab-provider-8")).toEqual({ ok: false, reason: "not_a_member" });
    expect(switchWorkspace(W.multiLabManager, "lab", "ambulance:fx-amb-provider-1")).toEqual({ ok: false, reason: "not_a_member" });
    expect(parseWorkspaceKey("lab:../../x")).toBeNull();
  });

  it("never mixes rows across providers", () => {
    const [ws] = listWorkspaces(W.labManager, "lab");
    const rows = [{ providerId: "fx-lab-provider-1" }, { providerId: "fx-lab-provider-9" }];
    expect(scopeToWorkspace(rows, ws, (r) => r.providerId)).toEqual([{ providerId: "fx-lab-provider-1" }]);
    expect(belongsToWorkspace(rows, ws, (r) => r.providerId)).toBe(false);
  });

  it("derives module actors from membership role and scopes; unknown scopes are ignored", () => {
    const [mgr] = listWorkspaces(W.labManager, "lab");
    expect(toLabActor(mgr).roles).toEqual(["manager"]);
    const [col] = listWorkspaces(W.labCollector, "lab");
    expect(toLabActor(col)).toMatchObject({ roles: ["collector"], resourceId: "fx-res-collector-a" });
    const [weird] = listWorkspaces([{ ...W.labCollector[0], scopes: ["lab:superuser", "lab:reviewer"] }], "lab");
    expect(toLabActor(weird).roles).toEqual(["reviewer"]);
    expect(toAmbulanceActor(listWorkspaces(W.ambulanceDriver, "ambulance")[0]).roles).toEqual(["driver"]);
    expect(toCareActor(listWorkspaces(W.independentCaregiver, "caretaker")[0]).kind).toBe("independent");
    expect(toCareActor(listWorkspaces(W.agencyManager, "caretaker")[0]).kind).toBe("agency_manager");
    expect(toCareActor(listWorkspaces(W.caregiverA, "caretaker")[0]).kind).toBe("agency_caregiver");
  });
});

describe("safe login redirect", () => {
  it.each([
    ["/en/lab/orders", "/en/lab/orders"],
    ["/te/admin?ref=%23SCV-BKG-000142", "/te/admin"],
    ["https://evil.example/en", "/en"],
    ["//evil.example", "/en"],
    ["/en/../admin", "/en"],
    ["/fr/lab", "/en"],
    ["javascript:alert(1)", "/en"],
  ])("%s -> %s", (input, expected) => {
    expect(safeInternalPath("en", input)).toBe(expected);
  });

  it("builds an encoded login path", () => {
    expect(loginRedirectPath("hi", "/hi/caretaker/shifts")).toBe("/hi/login?next=%2Fhi%2Fcaretaker%2Fshifts");
  });
});

describe("role guards", () => {
  it("unauthenticated users are sent to login, users without a workspace are denied", () => {
    expect(decideLabRoute(null, "dashboard", "en", "/en/lab", undefined)).toEqual({ kind: "unauthenticated", loginPath: "/en/login?next=%2Fen%2Flab" });
    expect(decideLabRoute(session(W.ambulanceOperator), "dashboard", "en", "/en/lab", undefined)).toEqual({ kind: "denied" });
  });

  it("memberships of another person in the session are ignored", () => {
    const forged: GuardSession = { profileId: "fx-prof-someone-else", memberships: W.labManager };
    expect(decideLabRoute(forged, "dashboard", "en", "/en/lab", undefined)).toEqual({ kind: "denied" });
  });

  it("lab: collector cannot open reports or orders; reviewer can open reports only", () => {
    const collector = session(W.labCollector);
    expect(decideLabRoute(collector, "collections", "en", "/en/lab/collections", undefined).kind).toBe("allowed");
    expect(decideLabRoute(collector, "reports", "en", "/en/lab/reports", undefined).kind).toBe("denied");
    expect(decideLabRoute(collector, "orders", "en", "/en/lab/orders", undefined).kind).toBe("denied");
    const reviewer = session(W.labReviewer);
    expect(decideLabRoute(reviewer, "reports", "en", "/en/lab/reports", undefined).kind).toBe("allowed");
    expect(decideLabRoute(reviewer, "collections", "en", "/en/lab/collections", undefined).kind).toBe("denied");
    expect(decideLabRoute(session(W.multiLabManager), "orders", "en", "/en/lab/orders", undefined).kind).toBe("choose_workspace");
    const nav = labNavigation(listWorkspaces(W.labCollector, "lab")[0], "en").map((n) => n.route);
    expect(nav).toEqual(["dashboard", "collections", "support"]);
  });

  it("ambulance: driver sees driver view only, not fleet or requests", () => {
    const driver = session(W.ambulanceDriver);
    expect(decideAmbulanceRoute(driver, "driver", "en", "/en/ambulance/driver", undefined).kind).toBe("allowed");
    expect(decideAmbulanceRoute(driver, "fleet", "en", "/en/ambulance/fleet", undefined).kind).toBe("denied");
    expect(decideAmbulanceRoute(driver, "requests", "en", "/en/ambulance/requests", undefined).kind).toBe("denied");
    expect(decideAmbulanceRoute(driver, "emergency", "en", "/en/ambulance/emergency", undefined).kind).toBe("allowed");
    expect(decideAmbulanceRoute(session(W.ambulanceOperator), "driver", "en", "/en/ambulance/driver", undefined).kind).toBe("denied");
  });

  it("caretaker: caregiver cannot open staff, services or requests; independent has no staff page", () => {
    const cg = session(W.caregiverA);
    for (const route of ["staff", "services", "requests"] as const) {
      expect(decideCaretakerRoute(cg, route, "en", `/en/caretaker/${route}`, undefined).kind).toBe("denied");
    }
    expect(decideCaretakerRoute(cg, "shifts", "en", "/en/caretaker/shifts", undefined).kind).toBe("allowed");
    expect(decideCaretakerRoute(session(W.independentCaregiver), "staff", "en", "/en/caretaker/staff", undefined).kind).toBe("denied");
    expect(decideCaretakerRoute(session(W.independentCaregiver), "services", "en", "/en/caretaker/services", undefined).kind).toBe("allowed");
    expect(caretakerNavigation(listWorkspaces(W.agencyManager, "caretaker")[0], "en").map((n) => n.route)).toContain("staff");
  });

  it("generic decision honours the permits predicate", () => {
    const res = decideWorkspaceAccess({ session: session(W.labManager), area: "lab", requestedWorkspaceKey: undefined, locale: "en", path: "/en/lab", permits: () => false });
    expect(res).toEqual({ kind: "denied" });
  });
});

describe("admin route guards", () => {
  const NOW = new Date("2026-11-20T00:00:00Z");
  it("each route needs its capability; deny by default", () => {
    expect(decideAdminRoute(null, "dashboard", "en", "/en/admin", NOW).kind).toBe("unauthenticated");
    expect(decideAdminRoute(adminPrincipals.noGrants, "dashboard", "en", "/en/admin", NOW).kind).toBe("denied");
    expect(decideAdminRoute(adminPrincipals.noMfa, "dashboard", "en", "/en/admin", NOW).kind).toBe("denied");
    expect(decideAdminRoute(adminPrincipals.verifier, "payments", "en", "/en/admin/payments", NOW).kind).toBe("denied");
    expect(decideAdminRoute(adminPrincipals.contentEditor, "cms", "en", "/en/admin/cms", NOW).kind).toBe("allowed");
    expect(decideAdminRoute(adminPrincipals.contentEditor, "settings", "en", "/en/admin/settings", NOW).kind).toBe("denied");
  });

  it("org-scoped auditor may open audit and dashboard only", () => {
    expect(decideAdminRoute(adminPrincipals.orgAuditor, "audit", "en", "/en/admin/audit", NOW).kind).toBe("allowed");
    expect(decideAdminRoute(adminPrincipals.orgAuditor, "users", "en", "/en/admin/users", NOW).kind).toBe("denied");
    expect(adminNavigation(adminPrincipals.orgAuditor, "en", NOW).map((n) => n.route)).toEqual(["dashboard", "audit"]);
  });
});
