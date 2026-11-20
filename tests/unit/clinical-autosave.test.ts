import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveError, classifySaveFailure, createAutosave } from "@/lib/clinical/autosave";

type Doc = { text: string };
let keys = 0;
const setup = (save: (c: Doc, v: number, k: string) => Promise<number>, load = vi.fn(async () => ({ version: 9, content: { text: "server" } }))) => {
  const states: string[] = [];
  const saveMock = vi.fn(save);
  const auto = createAutosave<Doc>({ version: 1, content: { text: "a" } }, {
    save: saveMock, load, newKey: () => `k${++keys}`, delayMs: 1000, retryMs: 3000, onStatus: s => states.push(s.state),
  });
  return { auto, save: saveMock, load, states };
};

beforeEach(() => { vi.useFakeTimers(); keys = 0; });
afterEach(() => { vi.useRealTimers(); });

describe("DC05 autosave", () => {
  it("debounces edits into one save of the latest content", async () => {
    const { auto, save } = setup(async (_c, v) => v + 1);
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(500);
    auto.change({ text: "c" });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ text: "c" }, 1, "k1");
    expect(auto.status()).toMatchObject({ state: "saved", version: 2, dirty: false });
  });

  it("an edit during a save is saved next on the new version", async () => {
    let release!: (v: number) => void;
    const { auto, save } = setup((_c, v) => v === 1 ? new Promise<number>(r => { release = r; }) : Promise.resolve(v + 1));
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(1000);
    auto.change({ text: "c" });
    expect(auto.status().state).toBe("saving");
    release(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenLastCalledWith({ text: "c" }, 2, "k2");
    expect(auto.status()).toMatchObject({ state: "saved", version: 3 });
  });

  it("a network failure retries with the same idempotency key", async () => {
    let calls = 0;
    const { auto, save } = setup(async (_c, v) => { if (++calls === 1) throw new TypeError("fetch failed"); return v + 1; });
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(auto.status()).toMatchObject({ state: "error", error: "network_error", dirty: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(save.mock.calls.map(c => c[2])).toEqual(["k1", "k1"]);
    expect(auto.status()).toMatchObject({ state: "saved", version: 2 });
  });

  it("an edit after a failure uses a new key", async () => {
    let calls = 0;
    const { auto, save } = setup(async (_c, v) => { if (++calls === 1) throw new SaveError("retryable", "booking_unavailable"); return v + 1; });
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(1000);
    auto.change({ text: "c" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save.mock.calls.map(c => [c[0].text, c[2]])).toEqual([["b", "k1"], ["c", "k2"]]);
  });

  it("reconnect retries at once", async () => {
    let calls = 0;
    const { auto, save } = setup(async (_c, v) => { if (++calls === 1) throw new TypeError("offline"); return v + 1; });
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(1000);
    await auto.reconnect();
    expect(save).toHaveBeenCalledTimes(2);
    expect(auto.status().state).toBe("saved");
  });

  it("stale_version stops autosave, loads the server copy and waits for a choice", async () => {
    const { auto, save, load } = setup(async (_c, v) => { if (v === 1) throw new SaveError("conflict", "stale_version"); return v + 1; });
    auto.change({ text: "mine" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(auto.status()).toMatchObject({ state: "conflict", dirty: true, server: { version: 9, content: { text: "server" } } });
    auto.change({ text: "mine2" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    await auto.keepMine();
    expect(save).toHaveBeenLastCalledWith({ text: "mine2" }, 9, "k2");
    expect(auto.status()).toMatchObject({ state: "saved", version: 10 });
  });

  it("takeServer discards local edits", async () => {
    const { auto } = setup(async () => { throw new SaveError("conflict", "stale_version"); });
    auto.change({ text: "mine" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(auto.takeServer()).toEqual({ text: "server" });
    expect(auto.status()).toMatchObject({ state: "saved", version: 9, dirty: false });
  });

  it("a fatal failure is not retried", async () => {
    const { auto, save } = setup(async () => { throw new SaveError("fatal", "draft_signed"); });
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(auto.status()).toMatchObject({ state: "error", error: "draft_signed" });
  });

  it("flush saves immediately and dispose stops timers", async () => {
    const { auto, save } = setup(async (_c, v) => v + 1);
    auto.change({ text: "b" });
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(1);
    auto.change({ text: "c" });
    auto.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports explicit states in order", async () => {
    const { auto, states } = setup(async (_c, v) => v + 1);
    auto.change({ text: "b" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toEqual(["unsaved", "saving", "saved"]);
  });
});

describe("classifySaveFailure", () => {
  it.each([
    [409, "stale_version", "conflict"], [409, "draft_signed", "fatal"], [409, "conflict", "fatal"],
    [503, "booking_unavailable", "retryable"], [429, "rate_limited", "retryable"], [403, "forbidden", "fatal"], [422, "invalid_input", "fatal"],
  ] as const)("%i %s -> %s", (status, code, kind) => {
    expect(classifySaveFailure(status, code)).toBe(kind);
  });
});
