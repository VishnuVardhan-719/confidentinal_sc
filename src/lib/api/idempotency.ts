/** Keep this object in memory for ONE user intent, including uncertain-outcome retries.
 * Create a new intent after material input changes; never persist patient input with it. */
export function createIdempotencyIntent(): Readonly<{ key: string }> {
  return Object.freeze({ key: globalThis.crypto.randomUUID() });
}
