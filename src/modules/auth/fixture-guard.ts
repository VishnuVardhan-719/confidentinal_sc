import { assertFixtureEnvironment } from "@/lib/api/mode";

/**
 * Second line of defence behind getAdapterMode(): fixture adapters refuse to construct
 * outside the allowlisted environments, even if someone imports them directly. One shared check
 * (src/lib/api/mode.ts fixtureRefusal, REQUESTS R-FE-D-42): APP_ENV development/test/preview/staging,
 * or unset under next dev/vitest; VERCEL_ENV=production always refuses. The real process
 * environment stays authoritative: an injected env object can add a refusal, never lift one.
 */
export function assertFixtureAllowed(env: Record<string, string | undefined> = process.env): void {
  assertFixtureEnvironment(env);
}

export type FixtureOptions = {
  env?: Record<string, string | undefined>;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};
