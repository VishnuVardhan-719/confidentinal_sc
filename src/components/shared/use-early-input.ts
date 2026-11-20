"use client";

import { useLayoutEffect, useRef, type Ref, type RefCallback } from "react";

/**
 * Controlled fields lose what was typed before hydration: the server HTML is usable while JS is
 * still loading, React hydrates with the initial state (""), and the next render writes that back
 * over the DOM (docs/frontend/REQUESTS.md R-FE-D-41). `onHydrated` runs once, in a layout effect
 * right after hydration and before paint or any re-render, so the component can adopt the values
 * still sitting in the DOM. On a client-side mount the DOM equals the state, so it is a no-op.
 */
export function useOnHydrated(capture: () => void): void {
  // Once per mount by design: later renders must never re-read the DOM over React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(capture, []);
}

/**
 * For a single controlled <input>: returns a ref for it. If the DOM value differs from `value` at
 * hydration (typed early), `adopt(raw)` receives it; `adopt` should normalise and set state.
 */
export function useEarlyInputRef(value: string, adopt: (raw: string) => void) {
  const ref = useRef<HTMLInputElement | null>(null);
  useOnHydrated(() => {
    const raw = ref.current?.value ?? "";
    if (raw !== "" && raw !== value) adopt(raw);
  });
  return ref;
}

/** One ref callback that feeds several refs (an internal one plus the caller's `ref` prop). */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    const cleanups: (() => void)[] = [];
    for (const r of refs) {
      if (typeof r === "function") {
        const c = r(node);
        cleanups.push(typeof c === "function" ? c : () => r(null));
      } else if (r) {
        r.current = node;
        cleanups.push(() => (r.current = null));
      }
    }
    return () => cleanups.forEach((c) => c());
  };
}
