import { presentProviderStatus, type StatusPresentation } from "@/modules/verification/status";
import type { Locale, Role } from "./roles";
import { homePath, onboardingPath } from "./routes";
import type { Identity, WorkspaceState } from "./types";

/**
 * View model for /workspace/select. One entry per workspace the SERVER reported; each
 * links to a route the guard will allow for that workspace state.
 */
export type WorkspaceChoice = {
  key: string;
  role: Role;
  state: WorkspaceState;
  labelKey: `common.roles.${Role}`;
  stateLabelKey: `common.workspaceState.${WorkspaceState}`;
  organizationName: string | null;
  providerStatus: StatusPresentation | null;
  href: string;
};

export function workspaceChoices(identity: Identity, locale: Locale): WorkspaceChoice[] {
  return identity.workspaces.map((w, i) => {
    const href =
      w.role === "admin" && w.state !== "active"
        ? `/${locale}/account/security`
        : w.state === "onboarding_incomplete" || w.state === "unknown"
          ? onboardingPath(w.role, locale)
          : homePath(w.role, locale);
    return {
      key: `${w.role}:${w.providerId ?? w.membership?.organizationId ?? i}`,
      role: w.role,
      state: w.state,
      labelKey: `common.roles.${w.role}`,
      stateLabelKey: `common.workspaceState.${w.state}`,
      organizationName: w.membership?.organizationName ?? null,
      providerStatus: w.providerStatus ? presentProviderStatus(w.providerStatus) : null,
      href,
    };
  });
}
