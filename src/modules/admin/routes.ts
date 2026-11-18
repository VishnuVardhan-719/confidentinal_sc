import { decideAdminAccess, type AdminAccess, type AppLocale } from "./access";
import { ADMIN_CAPABILITIES, can, type AdminCapability, type AdminPrincipal } from "./capabilities";

/**
 * Admin route -> capability map. `providers` and `coverage` pages are owned by
 * another agent; they appear here only so navigation is complete.
 */
export const ADMIN_ROUTES = ["dashboard", "providers", "coverage", "bookings", "users", "payments", "support", "cms", "audit", "settings"] as const;
export type AdminRoute = (typeof ADMIN_ROUTES)[number];

export const ADMIN_ROUTE_CAPABILITIES: Record<AdminRoute, readonly AdminCapability[]> = {
  dashboard: ADMIN_CAPABILITIES,
  providers: ["provider:verify"],
  coverage: ["coverage:verify"],
  bookings: ["booking:operate"],
  users: ["membership:admin"],
  payments: ["payment:read"],
  support: ["support:operate"],
  cms: ["content:edit", "content:publish"],
  audit: ["security:audit"],
  settings: ["settings:read"],
};

/** Routes that accept organization-scoped grants (the data is then filtered by scope). */
const ORG_SCOPED_OK: ReadonlySet<AdminRoute> = new Set(["dashboard", "audit"]);

/** Locale-prefixed path. Dashboard is `/{locale}/admin/dashboard` (auth module ROLE_HOME_PATH). */
export const adminPath = (locale: AppLocale, route: AdminRoute): string => `/${locale}/admin/${route}`;

export function decideAdminRoute(principal: AdminPrincipal | null, route: AdminRoute, locale: AppLocale, path: string, now?: Date): AdminAccess {
  return decideAdminAccess({ principal, anyOf: ADMIN_ROUTE_CAPABILITIES[route], locale, path, now, orgScopedOk: ORG_SCOPED_OK.has(route) });
}

export type NavItem = { route: string; href: string; labelKey: string };

/** Only routes the principal can open. Navigation is a convenience; the route guard still decides. */
export function adminNavigation(principal: AdminPrincipal | null, locale: AppLocale, now: Date = new Date()): NavItem[] {
  return ADMIN_ROUTES.filter((route) => decideAdminRoute(principal, route, locale, adminPath(locale, route), now).kind === "allowed").map(
    (route) => ({ route, href: adminPath(locale, route), labelKey: `admin.nav.${route}` }),
  );
}

/** Capabilities relevant to CMS actions on the page (edit vs publish buttons). */
export const cmsPermissions = (principal: AdminPrincipal | null, now: Date = new Date()) => ({
  canEdit: can(principal, "content:edit", { now }),
  canPublish: can(principal, "content:publish", { now }),
});
