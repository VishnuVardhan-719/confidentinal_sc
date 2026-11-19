import type { WorkspaceMembership } from "@/modules/admin/workspace";
import { SYNTHETIC_MARKER } from "./guard";

/**
 * SYNTHETIC memberships that line up with the operations fixtures, for
 * fixture-mode sessions and tests. Scope names are the proposed ones
 * (REQUESTS.md R-E08). Fictional people and providers only.
 */
const m = (over: Partial<WorkspaceMembership> & Pick<WorkspaceMembership, "membershipId" | "profileId" | "providerId" | "area" | "displayName">): WorkspaceMembership => ({
  organizationId: "fx-org-1",
  membershipRole: "staff",
  status: "active",
  scopes: [],
  resourceId: null,
  ...over,
});

export const workspaceMemberships = {
  labManager: [m({ membershipId: "fx-wm-1", profileId: "fx-prof-lab-manager", providerId: "fx-lab-provider-1", area: "lab", displayName: "Synthetic Lab One", membershipRole: "manager" })],
  labCollector: [m({ membershipId: "fx-wm-2", profileId: "fx-prof-collector-a", providerId: "fx-lab-provider-1", area: "lab", displayName: "Synthetic Lab One", scopes: ["lab:collector"], resourceId: "fx-res-collector-a" })],
  labCollectorB: [m({ membershipId: "fx-wm-12", profileId: "fx-prof-collector-b", providerId: "fx-lab-provider-1", area: "lab", displayName: "Synthetic Lab One", scopes: ["lab:collector"], resourceId: "fx-res-collector-b" })],
  labReviewer: [m({ membershipId: "fx-wm-3", profileId: "fx-prof-lab-reviewer", providerId: "fx-lab-provider-1", area: "lab", displayName: "Synthetic Lab One", scopes: ["lab:reviewer"] })],
  ambulanceOperator: [m({ membershipId: "fx-wm-4", profileId: "fx-prof-amb-operator", providerId: "fx-amb-provider-1", area: "ambulance", displayName: "Synthetic Transport Operator", membershipRole: "owner" })],
  ambulanceDriver: [m({ membershipId: "fx-wm-5", profileId: "fx-prof-driver-a", providerId: "fx-amb-provider-1", area: "ambulance", displayName: "Synthetic Transport Operator", scopes: ["ambulance:driver"], resourceId: "fx-res-driver-a" })],
  ambulanceDriverB: [m({ membershipId: "fx-wm-13", profileId: "fx-prof-driver-b", providerId: "fx-amb-provider-1", area: "ambulance", displayName: "Synthetic Transport Operator", scopes: ["ambulance:driver"], resourceId: "fx-res-driver-b" })],
  agencyManager: [m({ membershipId: "fx-wm-6", profileId: "fx-prof-care-manager", providerId: "fx-care-provider-agency", organizationId: "fx-care-agency-1", area: "caretaker", displayName: "Synthetic Care Agency", membershipRole: "manager" })],
  caregiverA: [m({ membershipId: "fx-wm-7", profileId: "fx-prof-care-a", providerId: "fx-care-provider-agency", organizationId: "fx-care-agency-1", area: "caretaker", displayName: "Synthetic Care Agency", scopes: ["care:caregiver"], resourceId: "fx-res-care-a" })],
  caregiverB: [m({ membershipId: "fx-wm-14", profileId: "fx-prof-care-b", providerId: "fx-care-provider-agency", organizationId: "fx-care-agency-1", area: "caretaker", displayName: "Synthetic Care Agency", scopes: ["care:caregiver"], resourceId: "fx-res-care-b" })],
  independentCaregiver: [m({ membershipId: "fx-wm-8", profileId: "fx-prof-care-indep", providerId: "fx-care-provider-indep", organizationId: null, area: "caretaker", displayName: "Fixture Independent Caregiver", membershipRole: "owner", resourceId: "fx-res-care-indep" })],
  /** One person managing two labs: must choose; never a combined view. */
  multiLabManager: [
    m({ membershipId: "fx-wm-9", profileId: "fx-prof-multi", providerId: "fx-lab-provider-1", area: "lab", displayName: "Synthetic Lab One", membershipRole: "manager" }),
    m({ membershipId: "fx-wm-10", profileId: "fx-prof-multi", providerId: "fx-lab-provider-9", organizationId: "fx-org-9", area: "lab", displayName: "Synthetic Lab Nine", membershipRole: "manager" }),
    m({ membershipId: "fx-wm-11", profileId: "fx-prof-multi", providerId: "fx-lab-provider-8", organizationId: "fx-org-8", area: "lab", displayName: "Synthetic Lab Eight (disabled)", membershipRole: "manager", status: "disabled" }),
  ],
} satisfies Record<string, WorkspaceMembership[]>;

export const workspaceFixtures = { ...SYNTHETIC_MARKER, memberships: workspaceMemberships };
