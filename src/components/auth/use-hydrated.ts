import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server HTML and during hydration, true once React owns the page. Controlled
 * controls use it to refuse input until their state can hold it, so nothing picked or typed on a
 * slow phone is silently lost (REQUESTS R-FE-D-40, ADVERSARIAL_REVIEW R6-1).
 * Same hook as fe-d's `src/components/clinical/use-hydrated.ts`; both should move to `src/lib`.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
