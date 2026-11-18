import type { ShellIcon } from "./app-shell";

/**
 * Role-aware workspace navigation (FRONTEND_MASTER s5 private route map), for <AppShell nav>.
 * Role layouts translate labels with `t(\`common.roleNav.${item.key}\`)` and keep only routes they
 * have built; each must resolve to a real page or an honest gated/empty state. Showing an item never
 * grants access: the role layout guard (requireRole) and the server decide.
 */
export const ROLES = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type RoleNavKey =
  | "dashboard"
  | "bookings"
  | "records"
  | "family"
  | "healthProfile"
  | "payments"
  | "notifications"
  | "support"
  | "profile"
  | "settings"
  | "requests"
  | "visits"
  | "availability"
  | "services"
  | "earnings"
  | "orders"
  | "collections"
  | "reports"
  | "catalog"
  | "branches"
  | "staff"
  | "billing"
  | "trips"
  | "fleet"
  | "crew"
  | "assignments"
  | "shifts"
  | "providers"
  | "coverage"
  | "users"
  | "refunds"
  | "content"
  | "audit";

export type RoleNavItem = { key: RoleNavKey; path: string; icon: ShellIcon; primary?: boolean };

const item = (key: RoleNavKey, path: string, icon: ShellIcon, primary = false): RoleNavItem => ({ key, path, icon, primary });

/** Paths are relative to the role root (/{role}); the first item is the dashboard. */
export const ROLE_NAV: Record<Role, readonly RoleNavItem[]> = {
  patient: [
    item("dashboard", "/dashboard", "home", true),
    item("bookings", "/bookings", "calendar", true),
    item("records", "/records", "file", true),
    item("family", "/family", "users"),
    item("healthProfile", "/health-profile", "clipboard"),
    item("payments", "/payments", "wallet"),
    item("notifications", "/notifications", "bell", true),
    item("support", "/support", "support", true),
    item("profile", "/profile", "user"),
    item("settings", "/settings", "settings"),
  ],
  doctor: [
    item("dashboard", "/dashboard", "home", true),
    item("requests", "/requests", "inbox", true),
    item("visits", "/visits", "stethoscope", true),
    item("availability", "/availability", "calendar", true),
    item("services", "/services", "clipboard"),
    item("earnings", "/earnings", "wallet"),
    item("notifications", "/notifications", "bell", true),
    item("support", "/support", "support"),
    item("profile", "/profile", "user"),
    item("settings", "/settings", "settings"),
  ],
  lab: [
    item("dashboard", "/dashboard", "home", true),
    item("orders", "/orders", "inbox", true),
    item("collections", "/collections", "flask", true),
    item("reports", "/reports", "file", true),
    item("catalog", "/catalog", "clipboard"),
    item("branches", "/branches", "building"),
    item("staff", "/staff", "users"),
    item("billing", "/billing", "wallet"),
    item("notifications", "/notifications", "bell", true),
    item("support", "/support", "support"),
    item("profile", "/profile", "user"),
    item("settings", "/settings", "settings"),
  ],
  ambulance: [
    item("dashboard", "/dashboard", "home", true),
    item("requests", "/requests", "inbox", true),
    item("trips", "/trips", "ambulance", true),
    item("fleet", "/fleet", "map"),
    item("crew", "/crew", "users"),
    item("availability", "/availability", "calendar", true),
    item("billing", "/billing", "wallet"),
    item("notifications", "/notifications", "bell", true),
    item("support", "/support", "support"),
    item("profile", "/profile", "user"),
    item("settings", "/settings", "settings"),
  ],
  caretaker: [
    item("dashboard", "/dashboard", "home", true),
    item("requests", "/requests", "inbox", true),
    item("assignments", "/assignments", "care", true),
    item("shifts", "/shifts", "calendar", true),
    item("services", "/services", "clipboard"),
    item("staff", "/staff", "users"),
    item("availability", "/availability", "calendar"),
    item("billing", "/billing", "wallet"),
    item("notifications", "/notifications", "bell", true),
    item("support", "/support", "support"),
    item("profile", "/profile", "user"),
    item("settings", "/settings", "settings"),
  ],
  admin: [
    item("dashboard", "/dashboard", "home", true),
    item("providers", "/providers", "shield", true),
    item("coverage", "/coverage", "map"),
    item("bookings", "/bookings", "calendar", true),
    item("users", "/users", "users"),
    item("staff", "/staff", "building"),
    item("payments", "/payments", "wallet"),
    item("refunds", "/refunds", "wallet"),
    item("support", "/support", "support", true),
    item("content", "/content", "file", true),
    item("audit", "/audit", "clipboard"),
    item("settings", "/settings", "settings"),
  ],
};

export function roleDashboardHref(role: Role): string {
  return `/${role}/dashboard`;
}

/** Full locale-less href for a role nav item, e.g. ("doctor", visits) -> "/doctor/visits". */
export function roleNavHref(role: Role, navItem: RoleNavItem): string {
  return `/${role}${navItem.path}`;
}

/**
 * Safe post-login return path: internal, single leading slash, no scheme/host, no backslashes or
 * control characters, query and hash dropped (they could carry data), bounded length.
 * Returns undefined when the path should not be passed.
 */
export function safeReturnPath(pathname: unknown): string | undefined {
  if (typeof pathname !== "string") return undefined;
  const path = pathname.split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 200) return undefined;
  if (/[\\\s]/.test(path) || /%2f|%5c|%00/i.test(path)) return undefined;
  if (Array.from(path).some((ch) => (ch.codePointAt(0) ?? 0) < 0x20)) return undefined;
  if (path === "/" || path === "/login" || path.startsWith("/login/") || path === "/signup" || path.startsWith("/signup/")) return undefined;
  return path;
}

export function loginHref(returnPath?: string): string {
  const next = safeReturnPath(returnPath);
  return next ? `/login?${new URLSearchParams({ next }).toString()}` : "/login";
}
