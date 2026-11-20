"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { catalogPageSchema, type ApiCategory, type CatalogRow } from "./booking";

const PAGE = 20;

export async function fetchCatalogPage(category: ApiCategory, pin: string, cursor: string | null, signal?: AbortSignal) {
  const body = await api<unknown>("/api/catalog", { query: { category, pin, limit: PAGE, cursor }, signal });
  const page = catalogPageSchema.parse(body);
  return { rows: page.results, next: page.nextCursor ?? null };
}

type Loaded = {
  tag: string;
  status: "ready" | "error";
  rows: CatalogRow[];
  next: string | null;
  error?: unknown;
  more: "idle" | "loading" | "error";
  moreError?: unknown;
};

export type CatalogSearch = {
  status: "idle" | "loading" | "ready" | "error";
  rows: CatalogRow[];
  next: string | null;
  error?: unknown;
  more: "idle" | "loading" | "error";
  moreError?: unknown;
  loadMore: () => void;
  retry: () => void;
};

/**
 * Public catalog search (GET /api/catalog) for one category and PIN code, with "show more" paging.
 * Only providers the server lists as publicly bookable for that PIN appear; nothing is filtered or added here.
 */
export function useCatalogSearch(category: ApiCategory | null, pin: string | null): CatalogSearch {
  const [attempt, setAttempt] = useState(0);
  const tag = category && pin ? `${attempt}#${category}|${pin}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!tag || !category || !pin) return;
    const controller = new AbortController();
    fetchCatalogPage(category, pin, null, controller.signal).then(
      ({ rows, next }) => {
        if (!controller.signal.aborted) setLoaded({ tag, status: "ready", rows, next, more: "idle" });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ tag, status: "error", rows: [], next: null, error, more: "idle" });
      },
    );
    return () => controller.abort();
  }, [tag, category, pin]);

  const current = tag && loaded?.tag === tag ? loaded : null;

  const loadMore = useCallback(() => {
    if (!category || !pin || !current || current.status !== "ready" || !current.next || current.more === "loading") return;
    const { tag: at, next: cursor } = current;
    setLoaded((s) => (s && s.tag === at ? { ...s, more: "loading", moreError: undefined } : s));
    fetchCatalogPage(category, pin, cursor).then(
      ({ rows, next }) => setLoaded((s) => (s && s.tag === at ? { ...s, rows: [...s.rows, ...rows], next, more: "idle" } : s)),
      (error: unknown) => setLoaded((s) => (s && s.tag === at ? { ...s, more: "error", moreError: error } : s)),
    );
  }, [category, pin, current]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!tag) return { status: "idle", rows: [], next: null, more: "idle", loadMore, retry };
  if (!current) return { status: "loading", rows: [], next: null, more: "idle", loadMore, retry };
  return { ...current, loadMore, retry };
}
