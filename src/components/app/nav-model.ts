import { homeFor, isProviderRole, type ProviderRole, type Role } from "./access";

/**
 * Role-aware navigation for the signed-in app shell. Roles come from GET /api/auth/me, never from the URL.
 * Showing a link is not permission: each screen is gated, and the API checks access again.
 */
export type AppIcon = "home" | "calendar" | "inbox" | "clipboard" | "queue" | "user" | "users" | "logout";
export type AppNavItem = { href: string; label: string; short: string; icon: AppIcon };

export const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker",
  admin: "Admin",
};

/** What a provider's requests are called, by provider kind. */
export const PROVIDER_WORK: Record<ProviderRole, { plural: string; short: string }> = {
  doctor: { plural: "Appointments", short: "Appts" },
  lab: { plural: "Sample collections", short: "Collections" },
  ambulance: { plural: "Scheduled transfers", short: "Transfers" },
  caretaker: { plural: "Support visits", short: "Visits" },
};

const account: AppNavItem = { href: "/account", label: "Account", short: "Account", icon: "user" };
export const SIGN_OUT: AppNavItem = { href: "/sign-out", label: "Sign out", short: "Sign out", icon: "logout" };

export const PATIENT_NAV: readonly AppNavItem[] = [
  { href: "/dashboard", label: "Your visits", short: "Visits", icon: "home" },
  { href: "/book", label: "Request a visit", short: "Request", icon: "calendar" },
  account,
];

export function providerNav(kind: ProviderRole): readonly AppNavItem[] {
  return [
    { href: "/provider", label: PROVIDER_WORK[kind].plural, short: PROVIDER_WORK[kind].short, icon: "inbox" },
    { href: "/provider/onboarding", label: "Provider profile", short: "Profile", icon: "clipboard" },
    account,
  ];
}

export const ADMIN_NAV: readonly AppNavItem[] = [
  { href: "/admin", label: "Verification queue", short: "Queue", icon: "queue" },
  account,
];

/** The account's main role: the one its home belongs to. */
export function primaryRole(roles: readonly Role[]): Role | null {
  const home = homeFor(roles);
  if (home === "/admin") return "admin";
  if (home === "/provider") return roles.find(isProviderRole) ?? null;
  return roles.includes("patient") ? "patient" : null;
}

/** Nav for the account's main area, plus account and sign out. */
export function navFor(roles: readonly Role[]): readonly AppNavItem[] {
  const role = primaryRole(roles);
  if (role === "admin") return ADMIN_NAV;
  if (role && isProviderRole(role)) return providerNav(role);
  if (role === "patient") return PATIENT_NAV;
  return [account];
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * aria-current for an app nav link. Only the most specific matching item is current, so on
 * /provider/onboarding the /provider link is not also marked.
 */
export function currentHref(pathname: string, items: readonly AppNavItem[]): string | undefined {
  return items
    .filter((item) => under(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
