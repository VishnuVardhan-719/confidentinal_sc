/**
 * Pre-launch mode (LAUNCH_MODE=prelaunch): the public deployment before the backend exists.
 *
 * Only the informational pages are served. Everything else (sign-in, sign-up, booking, the directories, every
 * workspace) answers with the "launching soon" holding page, and nothing but GET/HEAD is accepted, so no form or
 * server action can run. The decision is deny-by-default: a new route is closed until it is added to
 * PRELAUNCH_OPEN_PAGES on purpose. This mode never turns fixtures on; the fixture guard (src/lib/api/mode.ts)
 * still refuses them in production.
 */
type Env = Record<string, string | undefined>;

export function isPrelaunch(env: Env = process.env): boolean {
  return env.LAUNCH_MODE === "prelaunch";
}

/** Locale-less paths that stay open in pre-launch mode. They also feed the pre-launch sitemap. */
export const PRELAUNCH_OPEN_PAGES = [
  "/",
  "/about",
  "/our-story",
  "/how-it-works",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds",
  "/memberships",
  "/emergency",
] as const;

export const HOLDING_PATH = "/launching-soon";

export type PrelaunchDecision =
  | { action: "pass" }
  | { action: "refuse-method" }
  | { action: "hold"; locale: string };

const LOCALE_PATH = /^\/(en|te|hi)(\/.*)?$/;

export function prelaunchDecision(pathname: string, method: string): PrelaunchDecision {
  const match = LOCALE_PATH.exec(pathname);
  // No locale prefix: next-intl redirects to the prefixed URL, which is decided on the next request.
  if (!match) return { action: "pass" };
  if (method !== "GET" && method !== "HEAD") return { action: "refuse-method" };
  const rest = (match[2] ?? "").replace(/\/+$/, "") || "/";
  return (PRELAUNCH_OPEN_PAGES as readonly string[]).includes(rest) ? { action: "pass" } : { action: "hold", locale: match[1] };
}
