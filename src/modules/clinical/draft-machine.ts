import type { ApiErrorCode } from "@/lib/api/result";
import type { ClinicalDraftContent } from "./schemas";

/**
 * Pure state machine for the clinical draft editor (DC05).
 *
 * Status meanings:
 * - saving:   a save request is in flight
 * - saved:    server confirmed the current in-memory content
 * - unsaved:  local edits not yet confirmed by the server
 * - offline:  browser reports no connectivity; autosave paused
 * - failed:   last save failed (bounded retry)
 * - conflict: server has a newer version; autosave stopped until the clinician reconciles
 *
 * Content lives in memory only. This module never writes to browser persistent storage (web
 * storage, IndexedDB, cookies); a static test enforces this for all three modules.
 */
export const DRAFT_STATUSES = ["saving", "saved", "unsaved", "offline", "failed", "conflict"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const MAX_AUTOSAVE_FAILURES = 3;

/** A save in flight carries the exact content snapshot it sends, so batched edits cannot be mislabelled. */
export type InFlightSave = { requestId: number; baseVersion: number; editSeq: number; content: ClinicalDraftContent };

export type DraftState = {
  consultationId: string;
  content: ClinicalDraftContent;
  /** Last version confirmed by the server; sent as expectedVersion (optimistic concurrency). */
  serverVersion: number;
  status: DraftStatus;
  /** Monotonic counter of local edits. */
  editSeq: number;
  /** editSeq the server has confirmed. dirty <=> editSeq !== savedEditSeq. */
  savedEditSeq: number;
  inFlight: InFlightSave | null;
  nextRequestId: number;
  lastSavedAt: string | null;
  autosaveEnabled: boolean;
  failures: number;
  lastErrorCode: ApiErrorCode | null;
  online: boolean;
  conflict: { serverVersion: number | null } | null;
  finalized: boolean;
};

export type DraftAction =
  | { type: "edit"; content: ClinicalDraftContent }
  | { type: "save_requested" }
  | { type: "save_succeeded"; requestId: number; version: number; savedAt: string }
  | { type: "save_failed"; requestId: number; code: ApiErrorCode; serverVersion?: number }
  | { type: "connectivity_changed"; online: boolean }
  /** Explicit "Retry saving" after a terminal or exhausted failure. */
  | { type: "retry_requested" }
  | {
      type: "conflict_resolved";
      /** take_server: discard local edits; keep_local: rebase local edits on the server version. */
      resolution: "take_server" | "keep_local";
      server: { version: number; savedAt: string | null; content: ClinicalDraftContent };
      /**
       * editSeq of the local draft the clinician compared against the server version.
       * take_server is ignored if newer local edits exist, so unreviewed text is never discarded.
       */
      reviewedEditSeq: number;
    }
  | { type: "finalized" };

export function initDraftState(input: {
  consultationId: string;
  content: ClinicalDraftContent;
  version: number;
  savedAt: string | null;
  online?: boolean;
}): DraftState {
  const online = input.online ?? true;
  return {
    consultationId: input.consultationId,
    content: input.content,
    serverVersion: input.version,
    status: online ? "saved" : "offline",
    editSeq: 0,
    savedEditSeq: 0,
    inFlight: null,
    nextRequestId: 1,
    lastSavedAt: input.savedAt,
    autosaveEnabled: true,
    failures: 0,
    lastErrorCode: null,
    online,
    conflict: null,
    finalized: false,
  };
}

export const isDirty = (s: DraftState): boolean => s.editSeq !== s.savedEditSeq;

/** Only transient failures are retried automatically (bounded by MAX_AUTOSAVE_FAILURES). */
export const isRetryable = (code: ApiErrorCode): boolean => code === "unavailable" || code === "rate_limited";

/** Status to show when nothing is in flight and there is no conflict. */
function restingStatus(s: DraftState): DraftStatus {
  if (!s.online) return "offline";
  return isDirty(s) ? "unsaved" : "saved";
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  if (state.finalized && action.type !== "finalized") return state;

  switch (action.type) {
    case "edit": {
      const next: DraftState = { ...state, content: action.content, editSeq: state.editSeq + 1 };
      if (state.conflict || state.inFlight) return { ...next, status: state.status };
      if (state.status === "failed") return next;
      return { ...next, status: restingStatus(next) };
    }

    case "save_requested": {
      // Serialize writes: one in flight at a time; never blind-save during a conflict or offline.
      if (state.inFlight || state.conflict || !state.online) return state;
      if (!isDirty(state)) return state;
      return {
        ...state,
        status: "saving",
        inFlight: { requestId: state.nextRequestId, baseVersion: state.serverVersion, editSeq: state.editSeq, content: state.content },
        nextRequestId: state.nextRequestId + 1,
      };
    }

    case "save_succeeded": {
      // Stale or superseded response: ignore.
      if (!state.inFlight || action.requestId !== state.inFlight.requestId) return state;
      if (action.version <= state.serverVersion) return state;
      const next: DraftState = {
        ...state,
        serverVersion: action.version,
        savedEditSeq: state.inFlight.editSeq,
        inFlight: null,
        lastSavedAt: action.savedAt,
        failures: 0,
        lastErrorCode: null,
        autosaveEnabled: true,
      };
      return { ...next, status: restingStatus(next) };
    }

    case "save_failed": {
      if (!state.inFlight || action.requestId !== state.inFlight.requestId) return state;
      const base: DraftState = { ...state, inFlight: null, lastErrorCode: action.code };
      if (action.code === "conflict") {
        return {
          ...base,
          status: "conflict",
          autosaveEnabled: false,
          conflict: { serverVersion: action.serverVersion ?? null },
        };
      }
      const failures = state.failures + 1;
      // Auth/permission/validation/gate failures are not retried automatically.
      const retryable = isRetryable(action.code);
      return {
        ...base,
        failures,
        status: state.online ? "failed" : "offline",
        autosaveEnabled: retryable && failures < MAX_AUTOSAVE_FAILURES,
      };
    }

    case "connectivity_changed": {
      if (action.online === state.online) return state;
      const next: DraftState = { ...state, online: action.online };
      if (state.conflict) return next;
      if (state.inFlight) return { ...next, status: action.online ? "saving" : "offline" };
      if (!action.online) return { ...next, status: "offline" };
      // Reconnecting never lifts a terminal block (auth/permission/validation/gate) and never
      // refills the bounded retry budget; only retry_requested or a successful save does that.
      if (state.lastErrorCode !== null) {
        const retryable = isRetryable(state.lastErrorCode) && state.failures < MAX_AUTOSAVE_FAILURES;
        return { ...next, status: retryable ? restingStatus(next) : "failed", autosaveEnabled: retryable };
      }
      return { ...next, status: restingStatus(next) };
    }

    case "retry_requested": {
      // Explicit clinician action (after re-auth or correcting input). Never fired automatically.
      if (state.conflict || state.inFlight || state.lastErrorCode === null) return state;
      const next: DraftState = { ...state, failures: 0, lastErrorCode: null, autosaveEnabled: true };
      return { ...next, status: restingStatus(next) };
    }

    case "conflict_resolved": {
      if (!state.conflict || state.inFlight) return state;
      const { server } = action;
      // Both resolutions apply only to the exact edit sequence the clinician reviewed; newer
      // local edits need another explicit comparison.
      if (action.reviewedEditSeq !== state.editSeq) return state;
      // The reviewed server snapshot must not be older than the version that raised the conflict.
      const floor = state.conflict.serverVersion ?? state.serverVersion + 1;
      if (server.version < floor) return state;
      if (action.resolution === "take_server") {
        const next: DraftState = {
          ...state,
          content: server.content,
          serverVersion: server.version,
          savedEditSeq: state.editSeq,
          lastSavedAt: server.savedAt,
          conflict: null,
          autosaveEnabled: true,
          failures: 0,
          lastErrorCode: null,
        };
        return { ...next, status: restingStatus(next) };
      }
      // keep_local: clinician reviewed and chose their text; it becomes an unsaved edit on top of
      // the latest server version (the server keeps its own history of the newer version).
      const next: DraftState = {
        ...state,
        serverVersion: server.version,
        lastSavedAt: server.savedAt,
        editSeq: state.editSeq + 1,
        conflict: null,
        autosaveEnabled: true,
        failures: 0,
        lastErrorCode: null,
      };
      return { ...next, status: restingStatus(next) };
    }

    case "finalized":
      return { ...state, finalized: true, autosaveEnabled: false, inFlight: null };
  }
}

/** Should the debounced autosave fire now? */
export function shouldAutosave(s: DraftState): boolean {
  return s.autosaveEnabled && !s.finalized && s.online && !s.inFlight && !s.conflict && isDirty(s);
}

/**
 * Finalize is enabled only when the server has confirmed exactly what is on screen:
 * saved status, nothing dirty, nothing in flight, no conflict, not already final.
 * Required-field readiness (missingForFinalize) is checked separately.
 */
export function canFinalize(s: DraftState): boolean {
  return s.status === "saved" && !isDirty(s) && !s.inFlight && !s.conflict && !s.finalized && s.serverVersion > 0;
}

/** Warn before leaving the page/patient when local edits could be lost. */
export function hasUnsavedWork(s: DraftState): boolean {
  return !s.finalized && (isDirty(s) || s.inFlight !== null);
}
