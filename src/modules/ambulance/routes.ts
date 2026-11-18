import { decideWorkspaceAccess, type AppLocale, type AreaAccess, type GuardSession } from "@/modules/admin/access";
import type { NavItem } from "@/modules/admin/routes";
import { canSeeBilling, toAmbulanceActor, type Workspace } from "@/modules/admin/workspace";

/** Ambulance area routes (FE spec 13). Emergency is a hard-gated placeholder with 112 always visible. */
export const AMBULANCE_ROUTES = ["dashboard", "fleet", "crew", "availability", "requests", "trips", "driver", "billing", "support", "emergency"] as const;
export type AmbulanceRoute = (typeof AMBULANCE_ROUTES)[number];

type Rule = "operator" | "driver" | "billing" | "any";

const RULE: Record<AmbulanceRoute, Rule> = {
  dashboard: "any",
  fleet: "operator",
  crew: "operator",
  availability: "operator",
  requests: "operator",
  trips: "operator",
  // Driver view: assigned current trip only.
  driver: "driver",
  billing: "billing",
  support: "any",
  emergency: "any",
};

export function ambulanceRoutePermits(route: AmbulanceRoute, ws: Workspace): boolean {
  const rule = RULE[route];
  if (rule === "billing") return canSeeBilling(ws);
  const roles = toAmbulanceActor(ws).roles;
  if (rule === "any") return roles.length > 0 || canSeeBilling(ws);
  return roles.includes(rule);
}

/** Locale-prefixed path. Dashboard is `/{locale}/ambulance/dashboard` (auth module ROLE_HOME_PATH). */
export const ambulancePath = (locale: AppLocale, route: AmbulanceRoute): string => `/${locale}/ambulance/${route}`;

export function decideAmbulanceRoute(session: GuardSession, route: AmbulanceRoute, locale: AppLocale, path: string, workspaceKey: unknown): AreaAccess {
  return decideWorkspaceAccess({ session, area: "ambulance", requestedWorkspaceKey: workspaceKey, locale, path, permits: (ws) => ambulanceRoutePermits(route, ws) });
}

export function ambulanceNavigation(ws: Workspace, locale: AppLocale): NavItem[] {
  return AMBULANCE_ROUTES.filter((r) => ambulanceRoutePermits(r, ws)).map((route) => ({ route, href: ambulancePath(locale, route), labelKey: `ambulance.nav.${route}` }));
}
