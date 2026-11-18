import type { ApiResult } from "@/lib/api/result";
import { diffDraftSteps, type ConflictView } from "./conflict";
import { draftReducer, initDraftState, shouldAutosave, type DraftAction, type DraftState } from "./draft-machine";
import type { ClinicalDraftContent, SaveDraftRequest } from "./schemas";
import type { DraftSnapshot, SaveDraftResponse } from "./types";

/**
 * Framework-free autosave controller around the pure draft reducer. The React hook
 * (use-draft-autosave.ts) is a thin subscription over this, so the timing and stale-response
 * logic is unit-tested without a DOM.
 *
 * - Debounced save after a deliberate interval (default 800 ms, inside the 500-1000 ms proposal).
 * - One save in flight; each sends the content snapshot and the version it was based on.
 * - Bounded exponential backoff for retryable failures; no retry for auth/validation/gate.
 * - Conflict: autosave stops and the latest authorized server draft is fetched for review.
 * - Content stays in memory. Nothing is written to browser storage.
 */
export type SaveDraftFn = (consultationId: string, input: SaveDraftRequest) => Promise<ApiResult<SaveDraftResponse>>;
export type FetchDraftFn = (consultationId: string) => Promise<ApiResult<DraftSnapshot>>;

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export type AutosaveOptions = {
  initial: { consultationId: string; content: ClinicalDraftContent; version: number; savedAt: string | null; online?: boolean };
  save: SaveDraftFn;
  fetchLatest: FetchDraftFn;
  debounceMs?: number;
  maxBackoffMs?: number;
  timers?: Timers;
};

export type AutosaveSnapshot = { draft: DraftState; conflict: ConflictView | null };

export type AutosaveController = {
  getSnapshot: () => AutosaveSnapshot;
  subscribe: (listener: () => void) => () => void;
  edit: (content: ClinicalDraftContent) => void;
  /** Explicit "Save draft" button: skips the debounce. */
  saveNow: () => void;
  setOnline: (online: boolean) => void;
  /** Retry fetching the server draft after a conflict-fetch error. */
  reloadConflict: () => void;
  /** `reviewedEditSeq` is the conflict view's editSeq the clinician actually saw. */
  resolveConflict: (resolution: "take_server" | "keep_local", reviewedEditSeq: number) => void;
  markFinalized: () => void;
  /** Start timers/subscriptions; returns a stop function (safe for React strict-mode remounts). */
  attach: () => () => void;
};

export const DEFAULT_DEBOUNCE_MS = 800;

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createDraftAutosave(options: AutosaveOptions): AutosaveController {
  const timers = options.timers ?? defaultTimers;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxBackoffMs = options.maxBackoffMs ?? 8000;
  const id = options.initial.consultationId;

  let snapshot: AutosaveSnapshot = { draft: initDraftState(options.initial), conflict: null };
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let attached = false;
  let launched = 0; // last requestId sent
  let conflictFetchSeq = 0;

  const emit = () => listeners.forEach((l) => l());
  const set = (next: AutosaveSnapshot) => {
    if (next === snapshot) return;
    snapshot = next;
    emit();
  };

  const clearTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const schedule = () => {
    clearTimer();
    const d = snapshot.draft;
    if (!attached || !shouldAutosave(d)) return;
    const delay = d.failures > 0 ? Math.min(maxBackoffMs, debounceMs * 2 ** d.failures) : debounceMs;
    timer = timers.set(() => {
      timer = null;
      dispatch({ type: "save_requested" });
    }, delay);
  };

  const launch = () => {
    const f = snapshot.draft.inFlight;
    if (!f || f.requestId <= launched) return;
    launched = f.requestId;
    const { requestId, baseVersion, content } = f;
    options
      .save(id, { expectedVersion: baseVersion, content })
      .catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }))
      .then((r) => {
        if (r.ok) dispatch({ type: "save_succeeded", requestId, version: r.data.version, savedAt: r.data.savedAt });
        else dispatch({ type: "save_failed", requestId, code: r.error.code });
      });
  };

  const loadConflict = () => {
    const seq = ++conflictFetchSeq;
    set({ ...snapshot, conflict: { phase: "loading" } });
    options
      .fetchLatest(id)
      .catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }))
      .then((r) => {
        // Ignore if superseded or the conflict was already resolved.
        if (seq !== conflictFetchSeq || !snapshot.draft.conflict) return;
        set({
          ...snapshot,
          conflict: r.ok
            ? { phase: "review", server: r.data, changedSteps: diffDraftSteps(snapshot.draft.content, r.data.content), editSeq: snapshot.draft.editSeq }
            : { phase: "error", code: r.error.code },
        });
      });
  };

  function dispatch(action: DraftAction) {
    const before = snapshot.draft;
    const draft = draftReducer(before, action);
    if (draft === before) return;
    const enteredConflict = !before.conflict && !!draft.conflict;
    set({ draft, conflict: draft.conflict ? snapshot.conflict : null });
    if (draft.inFlight) launch();
    if (enteredConflict) loadConflict();
    else if (snapshot.conflict?.phase === "review" && action.type === "edit") {
      // Keep the changed-steps list honest while the clinician keeps typing.
      set({ ...snapshot, conflict: { ...snapshot.conflict, changedSteps: diffDraftSteps(draft.content, snapshot.conflict.server.content), editSeq: draft.editSeq } });
    }
    schedule();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    edit: (content) => dispatch({ type: "edit", content }),
    saveNow: () => {
      clearTimer();
      dispatch({ type: "save_requested" });
    },
    setOnline: (online) => dispatch({ type: "connectivity_changed", online }),
    reloadConflict: () => {
      if (snapshot.draft.conflict) loadConflict();
    },
    resolveConflict: (resolution, reviewedEditSeq) => {
      const c = snapshot.conflict;
      if (!c || c.phase !== "review") return;
      const before = snapshot.draft;
      dispatch({ type: "conflict_resolved", resolution, reviewedEditSeq, server: { version: c.server.version, savedAt: c.server.savedAt, content: c.server.content } });
      if (snapshot.draft !== before) conflictFetchSeq++;
    },
    markFinalized: () => {
      clearTimer();
      dispatch({ type: "finalized" });
    },
    attach: () => {
      attached = true;
      schedule();
      return () => {
        attached = false;
        clearTimer();
      };
    },
  };
}
