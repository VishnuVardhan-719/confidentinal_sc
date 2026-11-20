"use client";

import { useCallback, useEffect, useState } from "react";

export type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

/**
 * Runs `load` whenever `key` changes (null = do nothing) or `retry` is called. Aborts the previous request
 * and ignores late answers. Until the answer for the current key arrives, the state reads as loading.
 * Keep `load` keyed by `key`: it is read from the render that set the key.
 */
export function useRequest<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const tag = key === null ? null : `${attempt}#${key}`;
  const [result, setResult] = useState<{ tag: string; value: RequestState<T> } | null>(null);

  useEffect(() => {
    if (tag === null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ tag, value: { status: "ready", data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ tag, value: { status: "error", error } });
      },
    );
    return () => controller.abort();
    // `load` is intentionally not a dependency: callers pass a new closure each render, keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value: RequestState<T> =
    tag === null ? { status: "idle" } : result?.tag === tag ? result.value : { status: "loading" };
  return { ...value, retry } as RequestState<T> & { retry: () => void };
}
