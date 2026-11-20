// DC03 client polling helper for GET /api/bookings/:id/progress. Framework free; React or any
// other UI wires it with attachPageEvents. No Supabase Realtime channel is used (doctor design
// §8.5): the page refetches, and after a reconnect it asks only for events it has not seen.
//
// Rules: poll every 20 s while the page is visible and the visit is not terminal; after an
// error wait 40 s, then 60 s (cap) until a fetch succeeds; refetch at once on focus, on
// visibility and when the browser comes back online; stop at a terminal state or on stop().

export type ProgressEvent = { version: number; reason: string; occurred_at: string };
export type Progress = {
  booking_id: string; state: string; substate: string | null; version: number; terminal: boolean; events: ProgressEvent[];
};
export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
export type PollerOptions = {
  /** Calls the progress route with the last version the page has applied. */
  fetchProgress: (afterVersion: number) => Promise<Progress>;
  /** Receives every response that is not older than what the page already has. */
  onProgress: (progress: Progress) => void;
  onError?: (error: unknown) => void;
  isVisible?: () => boolean;
  timers?: Timers;
  /** Start from a version the page already rendered (for example from get_doctor_visit). */
  initialVersion?: number;
};

export const BASE_INTERVAL_MS = 20_000;
export const MAX_INTERVAL_MS = 60_000;

/** Delay before the next poll after `failures` consecutive errors: 20 s, 40 s, then 60 s. */
export function nextDelay(failures: number) {
  return Math.min(BASE_INTERVAL_MS * 2 ** Math.max(0, failures), MAX_INTERVAL_MS);
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createProgressPoller(options: PollerOptions) {
  const timers = options.timers ?? defaultTimers;
  const visible = options.isVisible ?? (() => true);
  let version = options.initialVersion ?? 0;
  let failures = 0;
  let handle: unknown = null;
  let inFlight = false;
  let stopped = true;
  let finished = false;

  const clear = () => { if (handle !== null) { timers.clear(handle); handle = null; } };
  const schedule = () => {
    clear();
    if (stopped || finished) return;
    handle = timers.set(() => { handle = null; if (visible()) void tick(); }, nextDelay(failures));
  };
  async function tick() {
    if (stopped || finished || inFlight) return;
    inFlight = true;
    clear();
    try {
      const progress = await options.fetchProgress(version);
      failures = 0;
      // A late response to an older request is dropped; versions only move forward.
      if (progress.version >= version) {
        version = progress.version;
        options.onProgress(progress);
      }
      if (progress.terminal) finished = true;
    } catch (error) {
      failures += 1;
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
    schedule();
  }

  return {
    /** Fetches now and keeps polling. */
    start() { if (finished) return; stopped = false; void tick(); },
    stop() { stopped = true; clear(); },
    /** Focus, visibility or reconnect: fetch now (a hidden page skipped its timer). */
    resume() { if (!stopped && !finished && visible()) void tick(); },
    lastVersion: () => version,
    isFinished: () => finished,
  };
}

type EventSource = { addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void };

/** Wires focus, online and visibilitychange to resume(); returns the detach function. */
export function attachPageEvents(poller: { resume: () => void }, win: EventSource, doc: EventSource) {
  const resume = () => poller.resume();
  win.addEventListener("focus", resume);
  win.addEventListener("online", resume);
  doc.addEventListener("visibilitychange", resume);
  return () => {
    win.removeEventListener("focus", resume);
    win.removeEventListener("online", resume);
    doc.removeEventListener("visibilitychange", resume);
  };
}
