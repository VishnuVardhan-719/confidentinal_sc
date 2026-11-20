"use client";

import { useLayoutEffect } from "react";

/**
 * Ask before leaving the page while there are unsaved changes (browser beforeunload prompt).
 *
 * A layout effect, not a passive one: it runs in the same commit that renders "Draft saved", so the
 * prompt is gone the moment the screen says the work is saved. With useEffect the listener lingered
 * until the passive effects flushed, which on a busy machine let a reload right after saving hit a
 * stale "unsaved changes" prompt (R9-D10: the cause of the doctor-consultation e2e 60 s hangs).
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useLayoutEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
