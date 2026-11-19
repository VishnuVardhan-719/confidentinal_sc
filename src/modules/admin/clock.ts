import { isFixtureMode } from "@/lib/api/mode";

type Env = Record<string, string | undefined>;

/**
 * The synthetic operations fixtures (src/fixtures/operations) describe one fixed
 * timeline around 20 Nov 2026 (quotes, trip windows, shifts, collection windows).
 * In fixture mode the operations clock starts at this instant the first time it is
 * read and then runs forward in real time, so "today", stale quotes and
 * the driver's current trip match the data no matter when the fixtures are run.
 * Override with FIXTURE_NOW=<ISO instant>. The http adapter always uses the real clock.
 */
export const OPS_FIXTURE_EPOCH = "2026-11-20T06:00:00Z";

/**
 * Set on first use, not at module load: reading the time while a module loads during a
 * prerender would mark unrelated routes (for example public stories) as dynamic.
 */
let startedAt: number | undefined;

export function operationsNow(env: Env = process.env): Date {
  if (!isFixtureMode(env)) return new Date();
  const real = Date.now();
  startedAt ??= real;
  const pinned = Date.parse(env.FIXTURE_NOW ?? OPS_FIXTURE_EPOCH);
  const base = Number.isFinite(pinned) ? pinned : Date.parse(OPS_FIXTURE_EPOCH);
  return new Date(base + (real - startedAt));
}

/** Clock function for a fixture adapter or loader context. */
export const operationsClock = (env: Env = process.env) => () => operationsNow(env);
