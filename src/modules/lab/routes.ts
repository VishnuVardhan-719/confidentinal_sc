import { decideWorkspaceAccess, type AppLocale, type AreaAccess, type GuardSession } from "@/modules/admin/access";
import type { NavItem } from "@/modules/admin/routes";
import { canSeeBilling, toLabActor, type Workspace } from "@/modules/admin/workspace";
import type { LabStaffRole } from "./types";

/** Lab area routes and who may open them (FE spec 12). */
export const LAB_ROUTES = ["dashboard", "branches", "catalog", "staff", "orders", "collections", "reports", "billing", "support"] as const;
export type LabRoute = (typeof LAB_ROUTES)[number];

const ROLE_RULE: Record<LabRoute, readonly LabStaffRole[] | "billing" | "any"> = {
  dashboard: "any",
  branches: ["manager"],
  catalog: ["manager"],
  staff: ["manager"],
  orders: ["manager"],
  // Collector queue: assigned collection jobs only.
  collections: ["collector"],
  // Reviewer queue: never accessible to an ordinary collector.
  reports: ["reviewer"],
  billing: "billing",
  support: "any",
};

export function labRoutePermits(route: LabRoute, ws: Workspace): boolean {
  const rule = ROLE_RULE[route];
  if (rule === "billing") return canSeeBilling(ws);
  const roles = toLabActor(ws).roles;
  if (rule === "any") return roles.length > 0 || canSeeBilling(ws);
  return rule.some((r) => roles.includes(r));
}

/** Locale-prefixed path. Dashboard is `/{locale}/lab/dashboard` (matches the auth module ROLE_HOME_PATH). */
export const labPath = (locale: AppLocale, route: LabRoute): string => `/${locale}/lab/${route}`;

export function decideLabRoute(session: GuardSession, route: LabRoute, locale: AppLocale, path: string, workspaceKey: unknown): AreaAccess {
  return decideWorkspaceAccess({ session, area: "lab", requestedWorkspaceKey: workspaceKey, locale, path, permits: (ws) => labRoutePermits(route, ws) });
}

export function labNavigation(ws: Workspace, locale: AppLocale): NavItem[] {
  return LAB_ROUTES.filter((r) => labRoutePermits(r, ws)).map((route) => ({ route, href: labPath(locale, route), labelKey: `lab.nav.${route}` }));
}
