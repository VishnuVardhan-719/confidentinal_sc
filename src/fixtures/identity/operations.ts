import type { Role } from "@/modules/auth/roles";
import type { Session } from "@/modules/auth/types";

/**
 * SYNTHETIC sign-in accounts for the operations workspaces (lab, ambulance, caretaker, admin,
 * CMS). Fictional people, `@example.invalid` emails and placeholder UUIDs only.
 *
 * Each account has one ACTIVE workspace so requireRole() lets it into its area. What it may do
 * inside the area comes from the operations fixtures: `profileId` matches a membership in
 * src/fixtures/operations/workspaces.ts or a principal in src/fixtures/operations/admin.ts.
 * The mapping is fixture-only; the http adapter fails closed until the session API reports
 * memberships, scopes, MFA and grants (docs/frontend/REQUESTS.md R-FE07-02).
 */

type OperationsPersona = { userId: string; email: string; displayName: string; role: Extract<Role, "lab" | "ambulance" | "caretaker" | "admin">; profileId: string };

const persona = (n: number, email: string, displayName: string, role: OperationsPersona["role"], profileId: string): OperationsPersona => ({
  userId: `00000000-0000-4000-8000-000000000${String(800 + n)}`,
  email: `${email}@example.invalid`,
  displayName,
  role,
  profileId,
});

export const OPERATIONS_PERSONAS = {
  ops_lab_manager: persona(1, "ops.lab.manager", "Synthetic Lab Manager", "lab", "fx-prof-lab-manager"),
  ops_lab_collector_a: persona(2, "ops.lab.collector.a", "Synthetic Collector A", "lab", "fx-prof-collector-a"),
  ops_lab_collector_b: persona(3, "ops.lab.collector.b", "Synthetic Collector B", "lab", "fx-prof-collector-b"),
  ops_lab_reviewer: persona(4, "ops.lab.reviewer", "Synthetic Lab Reviewer", "lab", "fx-prof-lab-reviewer"),
  ops_lab_multi: persona(5, "ops.lab.multi", "Synthetic Two-lab Manager", "lab", "fx-prof-multi"),
  ops_ambulance_operator: persona(11, "ops.ambulance.operator", "Synthetic Transport Owner", "ambulance", "fx-prof-amb-operator"),
  ops_ambulance_driver_a: persona(12, "ops.ambulance.driver.a", "Synthetic Driver A", "ambulance", "fx-prof-driver-a"),
  ops_ambulance_driver_b: persona(13, "ops.ambulance.driver.b", "Synthetic Driver B", "ambulance", "fx-prof-driver-b"),
  ops_care_manager: persona(21, "ops.care.manager", "Synthetic Agency Manager", "caretaker", "fx-prof-care-manager"),
  ops_care_a: persona(22, "ops.care.a", "Synthetic Caregiver A", "caretaker", "fx-prof-care-a"),
  ops_care_b: persona(23, "ops.care.b", "Synthetic Caregiver B", "caretaker", "fx-prof-care-b"),
  ops_care_independent: persona(24, "ops.care.independent", "Synthetic Independent Caregiver", "caretaker", "fx-prof-care-indep"),
  ops_admin_verifier: persona(31, "ops.admin.verifier", "Synthetic Verifier", "admin", "fx-adm-verifier"),
  ops_admin_lead: persona(32, "ops.admin.lead", "Synthetic Admin Lead", "admin", "fx-adm-super"),
  ops_admin_no_grants: persona(33, "ops.admin.nogrants", "Synthetic Admin Without Grants", "admin", "fx-adm-empty"),
  ops_admin_org_auditor: persona(34, "ops.admin.auditor", "Synthetic Org Auditor", "admin", "fx-adm-org-auditor"),
  ops_content_editor: persona(35, "ops.content.editor", "Synthetic Content Editor", "admin", "fx-adm-editor"),
  ops_content_publisher: persona(36, "ops.content.publisher", "Synthetic Content Publisher", "admin", "fx-adm-publisher"),
} as const satisfies Record<string, OperationsPersona>;

export type OperationsScenario = keyof typeof OPERATIONS_PERSONAS;
export const OPERATIONS_SCENARIOS = Object.keys(OPERATIONS_PERSONAS) as OperationsScenario[];

const entries = Object.entries(OPERATIONS_PERSONAS) as [OperationsScenario, OperationsPersona][];

export const OPERATIONS_SESSIONS = Object.fromEntries(
  entries.map(([scenario, p]) => [
    scenario,
    {
      kind: "authenticated",
      identity: { userId: p.userId, displayName: p.displayName, locale: "en", workspaces: [{ role: p.role, state: "active" }] },
    } satisfies Session,
  ]),
) as Record<OperationsScenario, Session>;

export const OPERATIONS_ACCOUNTS = Object.fromEntries(entries.map(([scenario, p]) => [p.email, scenario])) as Record<string, OperationsScenario>;

/**
 * Identity user -> operations fixture profile. Includes the identity fixtures' own verifier
 * (verifier@example.invalid) so the admin verification pages and the admin workspace agree.
 */
export const OPERATIONS_PROFILE_BY_USER: Readonly<Record<string, string>> = {
  ...Object.fromEntries(entries.map(([, p]) => [p.userId, p.profileId])),
  "00000000-0000-4000-8000-000000000601": "fx-adm-verifier",
};
