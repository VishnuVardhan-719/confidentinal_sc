/**
 * Role-aware navigation for the signed-in app shell.
 *
 * Sign-in (I01) does not exist yet, so the area is inferred from the URL. This decides which links to
 * show, nothing more: it is not access control. When auth lands, the role must come from the server
 * session and every route must check it server-side; the URL must never grant a role.
 */
export type AppRole = "patient" | "provider" | "admin";
export type AppIcon = "home" | "calendar" | "inbox" | "clipboard" | "queue" | "user";
export type AppNavItem = { href: string; label: string; short: string; icon: AppIcon };

export const ROLE_LABEL: Record<AppRole, string> = {
  patient: "Patient",
  provider: "Provider",
  admin: "Admin",
};

const account: AppNavItem = { href: "/account", label: "Account", short: "Account", icon: "user" };

export const NAV_BY_ROLE: Record<AppRole, readonly AppNavItem[]> = {
  patient: [
    { href: "/dashboard", label: "Dashboard", short: "Home", icon: "home" },
    { href: "/book", label: "Request a visit", short: "Request", icon: "calendar" },
    account,
  ],
  provider: [
    { href: "/provider", label: "Requests", short: "Requests", icon: "inbox" },
    { href: "/provider/onboarding", label: "Provider profile", short: "Profile", icon: "clipboard" },
    account,
  ],
  admin: [
    { href: "/admin", label: "Verification queue", short: "Queue", icon: "queue" },
    account,
  ],
};

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Area for a path. /account is shared, so it falls back to the patient area until a session exists. */
export function roleForPath(pathname: string): AppRole {
  if (under(pathname, "/provider")) return "provider";
  if (under(pathname, "/admin")) return "admin";
  return "patient";
}

/**
 * aria-current for an app nav link. Only the most specific matching item is current, so on
 * /provider/onboarding the "Requests" link (/provider) is not also marked.
 */
export function currentHref(pathname: string, items: readonly AppNavItem[]): string | undefined {
  return items
    .filter((item) => under(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
