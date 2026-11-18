import type { DemoRole } from "@/lib/demo/data";

/**
 * Role-aware navigation for the signed-in app shell. The role comes from the demo session on the server
 * (getDemoSession), never from the URL. Showing a link is not permission: each route checks the role itself.
 */
export type AppIcon = "home" | "calendar" | "inbox" | "clipboard" | "queue" | "user" | "users" | "logout";
export type AppNavItem = { href: string; label: string; short: string; icon: AppIcon };

export const ROLE_LABEL: Record<DemoRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker",
  admin: "Admin",
};

/** What a provider's requests are called, by provider kind. */
export const PROVIDER_WORK: Record<"doctor" | "lab" | "ambulance", { plural: string; short: string }> = {
  doctor: { plural: "Appointments", short: "Appts" },
  lab: { plural: "Sample collections", short: "Collections" },
  ambulance: { plural: "Scheduled transfers", short: "Transfers" },
};

const account: AppNavItem = { href: "/account", label: "Account", short: "Account", icon: "user" };
export const SIGN_OUT: AppNavItem = { href: "/sign-out", label: "Sign out", short: "Sign out", icon: "logout" };

function providerNav(kind: "doctor" | "lab" | "ambulance"): readonly AppNavItem[] {
  return [
    { href: "/provider", label: PROVIDER_WORK[kind].plural, short: PROVIDER_WORK[kind].short, icon: "inbox" },
    { href: "/provider/onboarding", label: "Provider profile", short: "Profile", icon: "clipboard" },
    account,
  ];
}

export const NAV_BY_ROLE: Record<DemoRole, readonly AppNavItem[]> = {
  patient: [
    { href: "/dashboard", label: "Dashboard", short: "Home", icon: "home" },
    { href: "/book", label: "Request a visit", short: "Request", icon: "calendar" },
    account,
  ],
  doctor: providerNav("doctor"),
  lab: providerNav("lab"),
  ambulance: providerNav("ambulance"),
  caretaker: [
    { href: "/caretaker", label: "People you support", short: "Home", icon: "users" },
    account,
  ],
  admin: [
    { href: "/admin", label: "Verification queue", short: "Queue", icon: "queue" },
    account,
  ],
};

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
