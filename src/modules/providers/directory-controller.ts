import { immutableSnapshot } from "@/lib/api/snapshot";
import { fail, type ApiError } from "@/lib/api/result";
import type { ProvidersApi } from "./api";
import { filtersSchema, type ProviderFilters } from "./filters";
import type { ProviderPage } from "./schemas";

export type DirectoryState = { phase: "idle" | "loading" | "ready" | "error" | "disposed"; page?: ProviderPage; error?: ApiError };
export function createDirectoryController(api: Pick<ProvidersApi, "list">) {
  let state: DirectoryState = immutableSnapshot({ phase: "idle" });
  let generation = 0;
  let abort: AbortController | undefined;
  const listeners = new Set<() => void>();
  function publish(next: DirectoryState) { state = immutableSnapshot(next); for (const listener of listeners) listener(); }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async load(input: ProviderFilters) {
      if (state.phase === "disposed") return;
      const version = ++generation;
      abort?.abort(); abort = new AbortController();
      const parsed = filtersSchema.safeParse(input);
      if (!parsed.success) { publish({ phase: "error", error: { code: "validation" } }); return; }
      publish({ phase: "loading", page: state.page });
      let result;
      try { result = await api.list(parsed.data, { signal: abort.signal }); } catch { result = fail("unavailable"); }
      if (version !== generation) return;
      publish(result.ok ? { phase: "ready", page: result.data } : { phase: "error", error: result.error });
    },
    clear() { if (state.phase === "disposed") return; generation++; abort?.abort(); publish({ phase: "idle" }); },
    dispose() { generation++; abort?.abort(); publish({ phase: "disposed" }); listeners.clear(); },
  };
}
