"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult } from "@/modules/admin/action-result";

export type TrackedResult<R> = R | { ok: false; code: "unavailable" };

/**
 * Tracks one server action from the moment it is called until it settles.
 * The ref is set before any state update, so a same-tick second submit is dropped (returns null)
 * before React re-renders the busy button. A rejected promise (network drop, server crash)
 * becomes an "unavailable" result instead of an unhandled rejection.
 * Start any router refresh inside `fn` so busy state never flickers off between the action and the refetch.
 */
export function useTrackedRun() {
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const track = useCallback(async <R extends ActionResult>(fn: () => Promise<R>): Promise<TrackedResult<R> | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setRunning(true);
    try {
      return await fn();
    } catch {
      return { ok: false, code: "unavailable" };
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, []);
  return { running, track };
}
