/**
 * Second line of defence behind getAdapterMode(): fixture adapters refuse to construct
 * when APP_ENV=production, even if someone imports them directly. The real process
 * environment stays authoritative: an injected env object cannot override it.
 */
export function assertFixtureAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.APP_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Fixture adapter is not allowed when APP_ENV=production");
  }
}

export type FixtureOptions = {
  env?: Record<string, string | undefined>;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};
