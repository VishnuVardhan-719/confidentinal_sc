import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { FIXTURE_ACCOUNTS, FIXTURE_SESSIONS, OPERATIONS_PERSONAS } from "@/fixtures/identity";
import { decideAdminRoute } from "@/modules/admin/routes";
import { operationsViewFor } from "@/modules/admin/session";
import { decideRoleAccess } from "@/modules/auth/guard";
import type { Identity } from "@/modules/auth/types";
import { decideLabRoute, labPath } from "@/modules/lab/routes";

const identityOf = (scenario: keyof typeof OPERATIONS_PERSONAS): Identity => {
  const s = FIXTURE_SESSIONS[scenario];
  if (s.kind !== "authenticated") throw new Error("expected an authenticated fixture");
  return s.identity;
};

describe("operations fixture accounts", () => {
  it("every persona signs in with an @example.invalid email to one active workspace", () => {
    for (const [scenario, p] of Object.entries(OPERATIONS_PERSONAS)) {
      expect(FIXTURE_ACCOUNTS[p.email]).toBe(scenario);
      expect(p.email.endsWith("@example.invalid")).toBe(true);
      expect(identityOf(scenario as keyof typeof OPERATIONS_PERSONAS).workspaces).toEqual([{ role: p.role, state: "active" }]);
    }
  });

  it("requireRole lets an active lab persona into the lab area and sends it home from admin", () => {
    const session = { ok: true as const, data: FIXTURE_SESSIONS.ops_lab_manager };
    expect(decideRoleAccess({ session, hadSession: true, role: "lab", locale: "en", path: "/en/lab/orders" }).kind).toBe("allowed");
    expect(decideRoleAccess({ session, hadSession: true, role: "admin", locale: "en", path: "/en/admin/dashboard" })).toEqual({ kind: "redirect", to: "/en/lab/dashboard" });
  });
});

describe("operationsViewFor", () => {
  it("maps a fixture lab manager to its synthetic membership for the lab area only", () => {
    const view = operationsViewFor(identityOf("ops_lab_manager"), "lab", true);
    expect(view.guard?.profileId).toBe("fx-prof-lab-manager");
    expect(view.guard?.memberships.map((m) => m.area)).toEqual(["lab"]);
    expect(decideLabRoute(view.guard, "orders", "en", labPath("en", "orders"), null).kind).toBe("allowed");
    expect(operationsViewFor(identityOf("ops_lab_manager"), "ambulance", true).guard?.memberships).toEqual([]);
  });

  it("maps admin personas to their principal; the lab persona gets no admin capability", () => {
    expect(operationsViewFor(identityOf("ops_admin_lead"), "admin", true).admin?.profileId).toBe("fx-adm-super");
    const labAsAdmin = operationsViewFor(identityOf("ops_lab_manager"), "admin", true).admin;
    expect(decideAdminRoute(labAsAdmin, "dashboard", "en", "/en/admin/dashboard").kind).toBe("denied");
  });

  it("fails closed in http mode and for unknown users (never unauthenticated, never guessed)", () => {
    for (const view of [operationsViewFor(identityOf("ops_lab_manager"), "lab", false), operationsViewFor({ ...identityOf("ops_lab_manager"), userId: "00000000-0000-4000-8000-000000000999" }, "lab", true)]) {
      expect(view.guard).not.toBeNull();
      expect(view.guard?.memberships).toEqual([]);
      expect(decideLabRoute(view.guard, "dashboard", "en", labPath("en", "dashboard"), null).kind).toBe("denied");
      expect(decideAdminRoute(view.admin, "dashboard", "en", "/en/admin/dashboard").kind).toBe("denied");
    }
  });
});
