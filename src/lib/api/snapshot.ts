/** Stable, detached snapshots for external stores. Inputs must be structured-cloneable. */
export function immutableSnapshot<T>(value: T): T {
  function freeze(item: unknown): void {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  }
  const snapshot = structuredClone(value);
  freeze(snapshot);
  return snapshot;
}
