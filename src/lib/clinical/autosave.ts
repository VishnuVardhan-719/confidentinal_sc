// DC05 client-side draft autosave. Framework-free: a page wires save/load to
// PUT/GET /api/bookings/:id/consultation/draft and renders status().state.
// Content stays in memory only; nothing is written to localStorage or any other browser store.
//
// Rules:
//  * change() marks the draft unsaved and schedules one save after delayMs (debounce).
//  * flush() saves now (explicit save button, leaving the page).
//  * A failed save keeps its idempotency key while the content and base version are unchanged,
//    so a retry after a lost response replays on the server instead of conflicting.
//  * 409 stale_version moves to "conflict", stops autosaving and loads the server copy; the
//    user chooses keepMine() or takeServer(). Nothing is merged silently.
//  * Retryable failures (network, 5xx, 429) retry after retryMs; reconnect() retries at once.
//  * Fatal failures (403, 404, 422, draft_signed) stop and stay in "error" with the code.

export type AutosaveState = "idle" | "unsaved" | "saving" | "saved" | "error" | "conflict";
export type DraftSnapshot<T> = { version: number; content: T };
export type AutosaveStatus<T> = { state: AutosaveState; version: number; dirty: boolean; error?: string; server?: DraftSnapshot<T> };
export type FailureKind = "conflict" | "retryable" | "fatal";

export class SaveError extends Error {
  constructor(readonly kind: FailureKind, readonly code: string) { super(code); }
}

/** Maps an HTTP response of the draft routes to a failure kind. */
export function classifySaveFailure(status: number, code: string | undefined): FailureKind {
  if (status === 409 && code === "stale_version") return "conflict";
  if (status === 429 || status >= 500) return "retryable";
  return "fatal";
}

export type AutosaveOptions<T> = {
  save(content: T, expectedVersion: number, idempotencyKey: string): Promise<number>;
  load(): Promise<DraftSnapshot<T>>;
  newKey(): string;
  delayMs?: number;
  retryMs?: number;
  onStatus?(status: AutosaveStatus<T>): void;
};

type Attempt<T> = { content: T; version: number; key: string };

export function createAutosave<T>(initial: DraftSnapshot<T>, options: AutosaveOptions<T>) {
  const delayMs = options.delayMs ?? 1500;
  const retryMs = options.retryMs ?? 5000;
  let content = initial.content;
  let version = initial.version;
  let state: AutosaveState = "idle";
  let dirty = false;
  let error: string | undefined;
  let server: DraftSnapshot<T> | undefined;
  let attempt: Attempt<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let closed = false;

  const status = (): AutosaveStatus<T> => ({ state, version, dirty, error, server });
  const set = (next: AutosaveState) => { state = next; options.onStatus?.(status()); };
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const schedule = (ms: number) => { clear(); if (!closed) timer = setTimeout(() => { timer = null; void run(); }, ms); };

  // A function, so TypeScript does not keep a narrowed state across awaits.
  const now = (): AutosaveState => state;

  async function run(): Promise<void> {
    clear();
    if (closed || now() === "conflict") return;
    if (inFlight) { await inFlight; if (dirty && now() !== "conflict" && now() !== "error") schedule(delayMs); return; }
    if (!dirty) return;
    // Same content on the same base version keeps its key, so the server can replay it.
    if (!attempt || attempt.content !== content || attempt.version !== version) attempt = { content, version, key: options.newKey() };
    const current = attempt;
    dirty = false;
    set("saving");
    inFlight = (async () => {
      try {
        version = await options.save(current.content, current.version, current.key);
        attempt = null;
        error = undefined;
        set(dirty ? "unsaved" : "saved");
      } catch (e) {
        const failure = e instanceof SaveError ? e : new SaveError("retryable", "network_error");
        dirty = true;
        error = failure.code;
        if (failure.kind === "conflict") {
          attempt = null;
          set("conflict");
          try { server = await options.load(); } catch { server = undefined; }
          options.onStatus?.(status());
        } else if (failure.kind === "retryable") {
          set("error");
          schedule(retryMs);
        } else {
          attempt = null;
          set("error");
        }
      }
    })();
    try { await inFlight; } finally { inFlight = null; }
    if (dirty && now() === "unsaved") schedule(delayMs);
  }

  return {
    status,
    /** Record a local edit. Pass a new object for every edit; identity marks a changed draft. */
    change(next: T) {
      content = next;
      dirty = true;
      if (state === "conflict") { options.onStatus?.(status()); return; }
      if (state !== "saving") set("unsaved");
      schedule(delayMs);
    },
    flush: () => run(),
    /** Retry pending work after the network comes back. */
    reconnect() { if (dirty && state !== "conflict") return run(); return Promise.resolve(); },
    /** Resolve a conflict by saving the local copy on top of the server version. */
    keepMine() {
      if (state !== "conflict" || !server) return Promise.resolve();
      version = server.version;
      server = undefined;
      error = undefined;
      dirty = true;
      set("unsaved");
      return run();
    },
    /** Resolve a conflict by discarding local edits. Returns the server content to render. */
    takeServer(): T | undefined {
      if (state !== "conflict" || !server) return undefined;
      content = server.content;
      version = server.version;
      server = undefined;
      error = undefined;
      dirty = false;
      attempt = null;
      set("saved");
      return content;
    },
    dispose() { closed = true; clear(); },
  };
}
