import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_INTERVAL_MS, MAX_INTERVAL_MS, attachPageEvents, createProgressPoller, nextDelay, type Progress } from "@/lib/doctor-extras/progress-poll";

const progress = (version: number, terminal = false): Progress => ({
  booking_id: "b", state: terminal ? "completed" : "confirmed", substate: "en_route", version, terminal,
  events: [{ version, reason: "en_route", occurred_at: "2026-11-20T10:00:00Z" }],
});
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("DC03 progress poller", () => {
  it("backs off 20 s, 40 s, then caps at 60 s", () => {
    expect([0, 1, 2, 3, 10].map(nextDelay)).toEqual([20_000, 40_000, 60_000, 60_000, 60_000]);
    expect(BASE_INTERVAL_MS).toBe(20_000);
    expect(MAX_INTERVAL_MS).toBe(60_000);
  });
  it("fetches at start, then every 20 s with the last applied version", async () => {
    const fetchProgress = vi.fn().mockResolvedValueOnce(progress(5)).mockResolvedValueOnce(progress(6)).mockResolvedValue(progress(6));
    const onProgress = vi.fn();
    const poller = createProgressPoller({ fetchProgress, onProgress, initialVersion: 4 });
    poller.start();
    await flush();
    expect(fetchProgress).toHaveBeenLastCalledWith(4);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchProgress).toHaveBeenLastCalledWith(5);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(poller.lastVersion()).toBe(6);
    poller.stop();
  });
  it("waits 40 s then 60 s after errors and resets after a success", async () => {
    const fetchProgress = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(progress(5));
    const onError = vi.fn();
    const poller = createProgressPoller({ fetchProgress, onProgress: vi.fn(), onError });
    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(39_999);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchProgress).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchProgress).toHaveBeenCalledTimes(4);
    poller.stop();
  });
  it("stops at a terminal state", async () => {
    const fetchProgress = vi.fn().mockResolvedValue(progress(9, true));
    const poller = createProgressPoller({ fetchProgress, onProgress: vi.fn() });
    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    poller.resume();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    expect(poller.isFinished()).toBe(true);
  });
  it("a hidden page skips its timer; focus, visibility and online refetch at once", async () => {
    let visible = true;
    const fetchProgress = vi.fn().mockResolvedValue(progress(5));
    const poller = createProgressPoller({ fetchProgress, onProgress: vi.fn(), isVisible: () => visible });
    const win = new EventTarget();
    const doc = new EventTarget();
    const detach = attachPageEvents(poller, win, doc);
    poller.start();
    await flush();
    visible = false;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchProgress).toHaveBeenCalledTimes(1); // the timer found the page hidden and did not fetch or reschedule
    visible = true;
    for (const [target, type] of [[win, "focus"], [doc, "visibilitychange"], [win, "online"]] as const) {
      const before = fetchProgress.mock.calls.length;
      target.dispatchEvent(new Event(type));
      await flush();
      expect(fetchProgress.mock.calls.length).toBe(before + 1);
    }
    detach();
    const before = fetchProgress.mock.calls.length;
    win.dispatchEvent(new Event("focus"));
    await flush();
    expect(fetchProgress.mock.calls.length).toBe(before);
    poller.stop();
  });
  it("drops a late response older than what the page already has", async () => {
    const fetchProgress = vi.fn().mockResolvedValueOnce(progress(8)).mockResolvedValueOnce(progress(7));
    const onProgress = vi.fn();
    const poller = createProgressPoller({ fetchProgress, onProgress });
    poller.start();
    await flush();
    poller.resume();
    await flush();
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(poller.lastVersion()).toBe(8);
    poller.stop();
  });
  it("does not overlap requests and does nothing after stop", async () => {
    let release: (p: Progress) => void = () => {};
    const fetchProgress = vi.fn(() => new Promise<Progress>(r => { release = r; }));
    const poller = createProgressPoller({ fetchProgress, onProgress: vi.fn() });
    poller.start();
    poller.resume();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    release(progress(5));
    await flush();
    poller.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    poller.resume();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  });
});
