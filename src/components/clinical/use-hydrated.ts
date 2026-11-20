"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false in the server HTML and during hydration, true once React owns the page.
 *
 * Why: these forms use controlled inputs. Before hydration the browser lets a person type or pick
 * an option, but React state still holds the initial value; after hydration the screen shows the
 * typed value while state (and therefore what is submitted) is empty, and the next render resets
 * selects to "". Disabling the controls until hydration makes that impossible
 * (docs/frontend/REQUESTS.md R-FE-D-40).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
