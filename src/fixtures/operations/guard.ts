/**
 * Synthetic operations fixtures (lab, ambulance, caretaker, admin, content, audit).
 * Every value in this folder is fictional. No real people, providers, vehicles,
 * registrations, phone numbers or addresses. PIN codes use the fictional 9999xx range.
 */
export const SYNTHETIC_MARKER = { synthetic: true, source: "fictional" } as const;

/**
 * Fixture adapters call this before returning any data. It refuses production
 * even when the adapter is constructed directly (not through getAdapterMode).
 */
export function assertFixtureAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.APP_ENV === "production") {
    throw new Error("Fixture adapter is not allowed when APP_ENV=production");
  }
}

/**
 * Idempotency replay for fixture mutations: the same key for the same
 * operation returns the first result instead of applying the change twice.
 */
export function createReplayCache() {
  const results = new Map<string, unknown>();
  return function once<R>(operation: string, key: string, run: () => R): R {
    const id = `${operation}:${key}`;
    if (results.has(id)) return results.get(id) as R;
    const result = run();
    results.set(id, result);
    return result;
  };
}

/** Deep copy so each fixture adapter instance owns its own mutable state. */
export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}
