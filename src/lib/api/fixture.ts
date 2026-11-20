import { assertFixtureEnvironment, getAdapterMode } from "./mode";

export type FixtureEnvironment = Record<string, string | undefined>;
/** Check at construction AND operation time, including explicitly imported adapters. */
export function assertFixtureMode(env: FixtureEnvironment = process.env): void {
  // APP_ENV is server-private. A browser must not infer adapter mode from stripped env vars
  // or turn on synthetic data through an injected object. Inject server-owned APIs instead.
  if (typeof window !== "undefined") throw new Error("Synthetic fixture adapters are server-only");
  assertFixtureEnvironment(env);
  if (getAdapterMode(env) !== "fixture") throw new Error("Synthetic fixtures require FRONTEND_ADAPTER=fixture");
}
export function fixtureGuard(env?: FixtureEnvironment): () => void {
  const check = () => assertFixtureMode(env);
  check();
  return check;
}
