import { DEMO_USERS, type DemoRole } from "./data";

/*
 * Demo sign-in, pure helpers (safe to import anywhere, including tests).
 *
 * This is NOT authentication. The demo cookie only picks which synthetic dashboard to show. Nothing may ever
 * read it to authorise real data or a real mutation. Real auth (I01, Supabase) replaces this entirely.
 */

export const DEMO_COOKIE = "scv_demo_role";
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

/** Where each role lands after demo sign-in. Dashboard routes are owned by the app-shell task (t22). */
export const DEMO_HOME: Record<DemoRole, string> = {
  patient: "/dashboard",
  doctor: "/provider",
  lab: "/provider",
  ambulance: "/provider",
  caretaker: "/provider",
  admin: "/admin",
};

export const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker",
  admin: "Admin",
};

export type DemoSession = {
  role: DemoRole;
  name: string;
  email: string;
  home: string;
  /** Always true. Lets UI code show the demo badge without guessing. */
  demo: true;
};

/** Build a session from a raw cookie value, or null if demo mode is off or the value is not a known role. */
export function demoSessionFrom(
  cookieValue: string | undefined,
  source?: Record<string, string | undefined>,
): DemoSession | null {
  if (!isDemoMode(source)) return null;
  const role = parseDemoRole(cookieValue);
  if (!role) return null;
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) return null;
  return { role, name: user.name, email: user.email, home: DEMO_HOME[role], demo: true };
}
