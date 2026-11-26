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

/**
 * Decide on the path exactly as the router will read it: percent-decoded once (Next and next-intl both do this,
 * so `/%65n/login` is `/en/login`) with repeated slashes collapsed. A path that cannot be decoded is held.
 */
export function prelaunchDecision(pathname: string, method: string): PrelaunchDecision {
  if (method !== "GET" && method !== "HEAD") return { action: "refuse-method" };
  let path: string;
  try {
    path = decodeURIComponent(pathname).replace(/\/{2,}/g, "/");
  } catch {
    return { action: "hold", locale: "en" };
  }
  const match = LOCALE_PATH.exec(path);
  if (!match) {
    // Static files (robots.txt, sitemap.xml, images) have no locale and contain a dot. Pages live only under a locale.
    if (path.includes(".")) return { action: "pass" };
    const bare = path.replace(/\/+$/, "") || "/";
    // An unprefixed open page is redirected to its locale URL, which is decided on the next request. Anything else is held.
    return bare === "/" || (PRELAUNCH_OPEN_PAGES as readonly string[]).includes(bare) ? { action: "pass" } : { action: "hold", locale: "en" };
  }
  const rest = (match[2] ?? "").replace(/\/+$/, "") || "/";
  return (PRELAUNCH_OPEN_PAGES as readonly string[]).includes(rest) ? { action: "pass" } : { action: "hold", locale: match[1] };
}
