import { DEMO_USERS, type DemoRole } from "./data";

/*
 * Demo sign-in, pure helpers (safe to import anywhere, including tests).
 *
 * This is NOT authentication. The demo cookies only pick which synthetic dashboard to show and what name to
 * greet. Nothing may ever read them to authorise real data or a real mutation. Real auth (I01, Supabase)
 * replaces this entirely.
 */

export const DEMO_COOKIE = "scv_demo_role";
/** Display-only details typed at demo sign-up (name, city). Never contact numbers, dates of birth or IDs. */
export const DEMO_PROFILE_COOKIE = "scv_demo_profile";
/** Eight hours: long enough for a demo, short enough not to linger on a shared device. */
export const DEMO_COOKIE_MAX_AGE = 60 * 60 * 8;

/**
 * Demo sign-in exists only when NEXT_PUBLIC_DEMO_MODE is exactly "true". Off by default.
 * The literal `process.env.NEXT_PUBLIC_DEMO_MODE` is deliberate: Next inlines it at build time, so the
 * prerendered page and the server action always agree. Reading it through a variable would not be inlined,
 * and a page built with demo on could then show a panel whose action refuses at runtime.
 */
export function isDemoMode(source?: Record<string, string | undefined>): boolean {
  const value = source ? source.NEXT_PUBLIC_DEMO_MODE : process.env.NEXT_PUBLIC_DEMO_MODE;
  return value === "true";
}

const ROLES: readonly DemoRole[] = DEMO_USERS.map((u) => u.role);

/** Allowlist parse: anything that is not one of the six demo roles is rejected. */
export function parseDemoRole(value: unknown): DemoRole | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as DemoRole) : null;
}

export const PROVIDER_ROLES = ["doctor", "lab", "ambulance"] as const satisfies readonly DemoRole[];
export const ALL_DEMO_ROLES: readonly DemoRole[] = ROLES;

/** Where each role lands after demo sign-in. Dashboard routes are owned by the app-shell task (t22). */
export const DEMO_HOME: Record<DemoRole, string> = {
  patient: "/dashboard",
  doctor: "/provider",
  lab: "/provider",
  ambulance: "/provider",
  caretaker: "/caretaker",
  admin: "/admin",
};

/** Where a brand-new demo account goes: providers finish onboarding first. Admin cannot sign up. */
export const SIGNUP_HOME: Record<Exclude<DemoRole, "admin">, string> = {
  patient: "/dashboard",
  doctor: "/provider/onboarding",
  lab: "/provider/onboarding",
  ambulance: "/provider/onboarding",
  caretaker: "/caretaker",
};

/**
 * Which demo roles may open each signed-in route. Longest matching prefix wins; paths not listed are public.
 * requireDemoRole() callers should pass the same roles so the guard and the sign-in redirect agree.
 */
export const ROUTE_ROLES: Record<string, readonly DemoRole[]> = {
  "/dashboard": ["patient"],
  "/book": ["patient"],
  "/provider": PROVIDER_ROLES,
  "/caretaker": ["caretaker"],
  "/admin": ["admin"],
  "/account": ROLES,
};

function routeRolesFor(pathname: string): readonly DemoRole[] | null {
  const match = Object.keys(ROUTE_ROLES)
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_ROLES[match] : null;
}

/** True when the role may open the path (public paths are open to everyone). */
export function canAccess(role: DemoRole, path: string): boolean {
  const pathname = path.split(/[?#]/)[0];
  const roles = routeRolesFor(pathname);
  return roles === null || roles.includes(role);
}

/**
 * A same-site path from a `?next=` value, or null. Rejects absolute and protocol-relative URLs, backslash
 * tricks, control characters and auth pages (which would loop).
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://same.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://same.invalid") return null;
  if (/^\/(sign-in|sign-up|sign-out|verify|forgot-password)(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/** Where to go after demo sign-in: `next` when that role may open it, otherwise the role's home. */
export function destinationFor(role: DemoRole, next: unknown): string {
  const target = safeNext(next);
  return target && canAccess(role, target) ? target : DEMO_HOME[role];
}

export const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker",
  admin: "Admin",
};

export type DemoProfile = { role: DemoRole; name: string; city?: string };

/** Serialise display-only details. Length-capped so a cookie can never grow large. */
export function encodeDemoProfile(p: DemoProfile): string {
  return JSON.stringify({ role: p.role, name: p.name.slice(0, 80), city: p.city?.slice(0, 60) });
}

export function decodeDemoProfile(raw: string | undefined): DemoProfile | null {
  if (!raw || raw.length > 400) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { role, name, city } = v as Record<string, unknown>;
    const r = parseDemoRole(role);
    if (!r || typeof name !== "string" || name.trim() === "" || name.length > 80) return null;
    if (city !== undefined && (typeof city !== "string" || city.length > 60)) return null;
    return { role: r, name, city: city as string | undefined };
  } catch {
    return null;
  }
}

export type DemoSession = {
  role: DemoRole;
  name: string;
  email: string;
  city?: string;
  home: string;
  /** True when the name came from the demo sign-up form rather than the stock demo user. */
  custom: boolean;
  /** Always true. Lets UI code show the demo badge without guessing. */
  demo: true;
};

/** Build a session from raw cookie values, or null if demo mode is off or the role is not a known one. */
export function demoSessionFrom(
  roleCookie: string | undefined,
  source?: Record<string, string | undefined>,
  profileCookie?: string,
): DemoSession | null {
  if (!isDemoMode(source)) return null;
  const role = parseDemoRole(roleCookie);
  if (!role) return null;
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) return null;
  const profile = decodeDemoProfile(profileCookie);
  const own = profile && profile.role === role ? profile : null;
  return {
    role,
    name: own?.name ?? user.name,
    email: user.email,
    city: own?.city,
    home: DEMO_HOME[role],
    custom: own !== null,
    demo: true,
  };
}
