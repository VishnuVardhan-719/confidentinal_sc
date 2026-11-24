/**
 * Public route catalogue (FRONTEND_MASTER section 5). Paths are locale-less; next-intl adds /{locale}.
 * Routes marked `owner: "other"` are built by other workstreams and may 404 until phase 2
 * (tracked in docs/frontend/REQUESTS.md).
 */
export const SERVICES = [
  { key: "doctors", href: "/doctors", icon: "stethoscope" },
  { key: "labTests", href: "/lab-tests", icon: "flask" },
  { key: "ambulances", href: "/ambulances", icon: "ambulance" },
  { key: "caretakers", href: "/caretakers", icon: "care" },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];
export const SERVICE_KEYS = SERVICES.map((s) => s.key) as readonly ServiceKey[];

export const PROVIDER_ROLES = ["doctor", "lab", "ambulance", "caretaker"] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];

/** Public pages owned by this workstream; these feed the sitemap. */
export const PUBLIC_PAGES = [
  "/",
  "/about",
  "/our-story",
  "/stories",
  "/how-it-works",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds",
  "/become-a-provider",
  "/memberships",
  "/emergency",
] as const;

export type PublicPage = (typeof PUBLIC_PAGES)[number];

/**
 * Every locale-less path listed in sitemap.xml: this workstream's pages plus the public directories
 * (`/doctors`, `/lab-tests`, `/ambulances`, `/caretakers`). Provider detail pages (`/lab-tests/[id]` and the like) are
 * not included: they are not indexed until real, verified providers exist.
 */
export const SITEMAP_PAGES = [...PUBLIC_PAGES, "/doctors", "/lab-tests", "/ambulances", "/caretakers"] as const;

export const AUTH_ROUTES = { login: "/login", signup: "/signup" } as const;

export function signupHref(role?: ProviderRole | "patient"): string {
  return role ? `${AUTH_ROUTES.signup}?role=${role}` : AUTH_ROUTES.signup;
}
