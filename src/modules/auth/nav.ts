import type { Role } from "./roles";
import { canAccessRoute } from "./routes";
import type { Session } from "./types";

/**
 * Role-aware workspace navigation (USER-REQ-1 A; routes from FRONTEND_MASTER s5).
 * Hrefs are locale-less (next-intl <Link> adds the locale); label keys live in `auth.nav`.
 * `primary` items appear in the mobile bottom bar (max 5). Visibility here is presentation
 * only: every page still calls requireRole, and the server/DB authorize every request.
 */
export type RoleNavItem = {
  key: string;
  href: `/${string}`;
  labelKey: `auth.nav.${string}`;
  icon: "home" | "calendar" | "inbox" | "users" | "user" | "file" | "settings" | "wallet" | "bell" | "support" | "clipboard" | "map" | "ambulance" | "flask" | "stethoscope" | "care" | "shield" | "building";
  primary?: boolean;
};

const item = (key: string, href: `/${string}`, icon: RoleNavItem["icon"], primary = false): RoleNavItem => ({
  key,
  href,
  labelKey: `auth.nav.${key}`,
  icon,
  primary,
});

export const ROLE_NAV: Readonly<Record<Role, readonly RoleNavItem[]>> = {
  patient: [
    item("dashboard", "/patient/dashboard", "home", true),
    item("findCare", "/doctors", "stethoscope", true),
    item("bookings", "/patient/bookings", "calendar", true),
    item("profile", "/patient/profile", "user", true),
    item("records", "/patient/records", "file"),
    item("payments", "/patient/payments", "wallet"),
    item("notifications", "/patient/notifications", "bell"),
    item("support", "/patient/support", "support", true),
    item("settings", "/patient/settings", "settings"),
  ],
  doctor: [
    item("dashboard", "/doctor/dashboard", "home", true),
    item("requests", "/doctor/requests", "inbox", true),
    item("visits", "/doctor/visits", "calendar", true),
    item("availability", "/doctor/availability", "clipboard"),
    item("providerProfile", "/doctor/profile", "user", true),
    item("onboarding", "/doctor/onboarding", "shield"),
    item("earnings", "/doctor/earnings", "wallet"),
    item("support", "/doctor/support", "support"),
    item("settings", "/doctor/settings", "settings"),
  ],
  lab: [
    item("dashboard", "/lab/dashboard", "home", true),
    item("orders", "/lab/orders", "inbox", true),
    item("collections", "/lab/collections", "flask", true),
    item("catalog", "/lab/catalog", "clipboard"),
    item("branches", "/lab/branches", "building"),
    item("staff", "/lab/staff", "users"),
    item("onboarding", "/lab/onboarding", "shield", true),
    item("support", "/lab/support", "support"),
    item("settings", "/lab/settings", "settings"),
  ],
  ambulance: [
    item("dashboard", "/ambulance/dashboard", "home", true),
    item("requests", "/ambulance/requests", "inbox", true),
    item("trips", "/ambulance/trips", "ambulance", true),
    item("fleet", "/ambulance/fleet", "clipboard"),
    item("crew", "/ambulance/crew", "users"),
    item("onboarding", "/ambulance/onboarding", "shield", true),
    item("support", "/ambulance/support", "support"),
    item("settings", "/ambulance/settings", "settings"),
  ],
  caretaker: [
    item("dashboard", "/caretaker/dashboard", "home", true),
    item("requests", "/caretaker/requests", "inbox", true),
    item("assignments", "/caretaker/assignments", "care", true),
    item("availability", "/caretaker/availability", "clipboard"),
    item("onboarding", "/caretaker/onboarding", "shield", true),
    item("support", "/caretaker/support", "support"),
    item("settings", "/caretaker/settings", "settings"),
  ],
  admin: [
    item("dashboard", "/admin/dashboard", "home", true),
    item("providerReview", "/admin/providers", "shield", true),
    item("coverage", "/admin/coverage", "map", true),
    item("adminBookings", "/admin/bookings", "calendar"),
    item("adminSupport", "/admin/support", "support"),
    item("audit", "/admin/audit", "file"),
    item("settings", "/admin/settings", "settings"),
  ],
};

/** Shared links for every signed-in user. */
export const ACCOUNT_NAV: readonly RoleNavItem[] = [
  item("switchWorkspace", "/workspace/select", "users"),
  item("security", "/account/security", "shield"),
  item("privacy", "/account/privacy", "file"),
];

/**
 * Nav for a session in one role: drops items the client-side guard would refuse for this
 * workspace state (e.g. bookings while onboarding is incomplete), so no item leads to a
 * guaranteed redirect. Public links (like /doctors) always stay.
 */
export function navFor(session: Session, role: Role, locale: string): RoleNavItem[] {
  return ROLE_NAV[role].filter((n) => n.href.startsWith(`/${role}/`) === false || canAccessRoute(session, `/${locale}${n.href}`).allowed);
}
