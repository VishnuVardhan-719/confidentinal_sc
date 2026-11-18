import { decideWorkspaceAccess, type AppLocale, type AreaAccess, type GuardSession } from "@/modules/admin/access";
import type { NavItem } from "@/modules/admin/routes";
import { canSeeBilling, toCareActor, type Workspace } from "@/modules/admin/workspace";

/** Caretaker / agency routes (FE spec 14). Plans are gated until scheduler and policy approval. */
export const CARETAKER_ROUTES = ["dashboard", "services", "staff", "availability", "requests", "assignments", "shifts", "plans", "billing", "support"] as const;
export type CaretakerRoute = (typeof CARETAKER_ROUTES)[number];

type Rule = "provider_manager" | "agency_manager" | "billing" | "any";

const RULE: Record<CaretakerRoute, Rule> = {
  dashboard: "any",
  services: "provider_manager",
  // Agency staff list: agency manager only; an independent caregiver has no staff.
  staff: "agency_manager",
  availability: "provider_manager",
  requests: "provider_manager",
  assignments: "any",
  shifts: "any",
  plans: "any",
  billing: "billing",
  support: "any",
};

export function caretakerRoutePermits(route: CaretakerRoute, ws: Workspace): boolean {
  const kind = toCareActor(ws).kind;
  switch (RULE[route]) {
    case "any":
      return true;
    case "billing":
      return canSeeBilling(ws);
    case "agency_manager":
      return kind === "agency_manager";
    case "provider_manager":
      return kind === "agency_manager" || kind === "independent";
  }
}

export const caretakerPath = (locale: AppLocale, route: CaretakerRoute): string =>
  route === "dashboard" ? `/${locale}/caretaker` : `/${locale}/caretaker/${route}`;

export function decideCaretakerRoute(session: GuardSession, route: CaretakerRoute, locale: AppLocale, path: string, workspaceKey: unknown): AreaAccess {
  return decideWorkspaceAccess({ session, area: "caretaker", requestedWorkspaceKey: workspaceKey, locale, path, permits: (ws) => caretakerRoutePermits(route, ws) });
}

export function caretakerNavigation(ws: Workspace, locale: AppLocale): NavItem[] {
  return CARETAKER_ROUTES.filter((r) => caretakerRoutePermits(r, ws)).map((route) => ({ route, href: caretakerPath(locale, route), labelKey: `caretaker.nav.${route}` }));
}
