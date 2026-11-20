export type AdapterMode = "http" | "fixture";

type Env = Record<string, string | undefined>;

/**
 * The only APP_ENV values that may serve synthetic fixture data. "staging" is included because the
 * other workstreams' e2e specs run fixtures with APP_ENV=staging (lead decision; see REQUESTS R-FE-D-41).
 */
export const FIXTURE_APP_ENVS = ["development", "test", "preview", "staging"] as const;

function refusalFor(env: Env): string | null {
  if (env.VERCEL_ENV === "production") return "VERCEL_ENV=production";
  const app = env.APP_ENV;
  if (app) return (FIXTURE_APP_ENVS as readonly string[]).includes(app) ? null : `APP_ENV=${app}`;
  // APP_ENV unset: only `next dev` or the test runner. A production server (`next start`,
  // NODE_ENV=production) with APP_ENV missing or mistyped is refused.
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? null : "APP_ENV is not set";
}

/**
 * Why synthetic fixtures are refused here, or null when they are allowed (allowlist, finding 2 of
 * docs/frontend/ADVERSARIAL_REVIEW.md). The real process env is authoritative: an injected env can
 * add a refusal but never lift one. Variables the injected env leaves out come from the real env.
 */
export function fixtureRefusal(env: Env = process.env): string | null {
  const real: Env = typeof process !== "undefined" && process.env ? process.env : {};
  return refusalFor(real) ?? (env === real ? null : refusalFor({ ...real, ...env }));
}

/** Throws unless synthetic fixtures are allowed. Shared by every fixture constructor. */
export function assertFixtureEnvironment(env: Env = process.env): void {
  const reason = fixtureRefusal(env);
  if (reason) throw new Error(`Synthetic fixtures are disabled here (${reason})`);
}

/**
 * Which data adapter every module uses. Default is the real HTTP adapter.
 * Fixture (synthetic) data is allowed only for APP_ENV development/test/preview/staging (or APP_ENV unset
 * under `next dev`/the test runner) and never when VERCEL_ENV=production.
 */
export function getAdapterMode(env: Env = process.env): AdapterMode {
  const wanted = env.FRONTEND_ADAPTER === "fixture" ? "fixture" : "http";
  if (wanted === "fixture") assertFixtureEnvironment(env);
  return wanted;
}

export const isFixtureMode = (env: Env = process.env): boolean => getAdapterMode(env) === "fixture";
