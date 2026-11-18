export type AdapterMode = "http" | "fixture";

/**
 * Which data adapter every module uses. Default is the real HTTP adapter.
 * Fixture (synthetic) data is refused when APP_ENV=production.
 */
export function getAdapterMode(env: Record<string, string | undefined> = process.env): AdapterMode {
  const wanted = env.FRONTEND_ADAPTER === "fixture" ? "fixture" : "http";
  if (wanted === "fixture" && env.APP_ENV === "production") {
    throw new Error("Fixture adapter is not allowed when APP_ENV=production");
  }
  return wanted;
}

export const isFixtureMode = (env: Record<string, string | undefined> = process.env): boolean =>
  getAdapterMode(env) === "fixture";
