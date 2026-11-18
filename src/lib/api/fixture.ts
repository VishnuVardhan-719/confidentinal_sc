import { getAdapterMode } from "./mode";

export type FixtureEnvironment = Record<string, string | undefined>;
/** Check at construction AND operation time, including explicitly imported adapters. */
export function assertFixtureMode(env: FixtureEnvironment = process.env): void {
  if (process.env.APP_ENV === "production") throw new Error("Synthetic fixtures are disabled in production");
  if (getAdapterMode(env) !== "fixture") throw new Error("Synthetic fixtures require FRONTEND_ADAPTER=fixture");
}
export function fixtureGuard(env?: FixtureEnvironment): () => void {
  const check = () => assertFixtureMode(env);
  check();
  return check;
}
