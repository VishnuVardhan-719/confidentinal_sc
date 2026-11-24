/**
 * The "Launching soon" welcome screen shows on the public deployments (staging and production) and never
 * in local development or tests, so day-to-day work and the e2e suite are not covered by it.
 * `LAUNCH_SPLASH=on` forces it, `LAUNCH_SPLASH=off` removes it.
 */
export function launchSplashEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.LAUNCH_SPLASH === "on") return true;
  if (env.LAUNCH_SPLASH === "off") return false;
  return env.APP_ENV === "staging" || env.APP_ENV === "production";
}
