import { isFixtureMode } from "@/lib/api/mode";

type Env = Record<string, string | undefined>;

/**
 * The synthetic operations fixtures (src/fixtures/operations) describe one fixed
 * timeline around 20 Nov 2026 (quotes, trip windows, shifts, collection windows).
 * In fixture mode the operations clock starts at this instant when the server
 * process starts and then runs forward in real time, so "today", stale quotes and
 * the driver's current trip match the data no matter when the fixtures are run.
 * Override with FIXTURE_NOW=<ISO instant>. The http adapter always uses the real clock.
 */
export const OPS_FIXTURE_EPOCH = "2026-11-20T06:00:00Z";

const startedAt = Date.now();

export function operationsNow(env: Env = process.env): Date {
  if (!isFixtureMode(env)) return new Date();
  const pinned = Date.parse(env.FIXTURE_NOW ?? OPS_FIXTURE_EPOCH);
  const base = Number.isFinite(pinned) ? pinned : Date.parse(OPS_FIXTURE_EPOCH);
  return new Date(base + (Date.now() - startedAt));
}

/** Clock function for a fixture adapter or loader context. */
export const operationsClock = (env: Env = process.env) => () => operationsNow(env);
