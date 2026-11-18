import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/lib/api/result";
import { createDraftAutosave } from "@/modules/clinical/autosave";
import { diffDraftSteps } from "@/modules/clinical/conflict";
import { canFinalize } from "@/modules/clinical/draft-machine";
import { emptyDraftContent, type ClinicalDraftContent, type SaveDraftRequest } from "@/modules/clinical/schemas";
import type { DraftSnapshot, SaveDraftResponse } from "@/modules/clinical/types";

const SAVED_AT = "2026-11-20T04:30:00.000Z";

type Pending = { input: SaveDraftRequest; resolve: (r: ApiResult<SaveDraftResponse>) => void };

function harness(opts: { fetchLatest?: () => Promise<ApiResult<DraftSnapshot>> } = {}) {
  const calls: Pending[] = [];
  const save = vi.fn((_id: string, input: SaveDraftRequest) => new Promise<ApiResult<SaveDraftResponse>>((resolve) => calls.push({ input, resolve })));
  const fetchLatest = vi.fn(opts.fetchLatest ?? (async () => ({ ok: false as const, error: { code: "unavailable" as const } })));
  const c = createDraftAutosave({ initial: { consultationId: "c1", content: emptyDraftContent(), version: 4, savedAt: SAVED_AT }, save, fetchLatest, debounceMs: 800 });
  const stop = c.attach();
  const withComplaint = (text: string): ClinicalDraftContent => ({ ...c.getSnapshot().draft.content, assessment: { chiefComplaint: text } });
  return { c, calls, save, fetchLatest, stop, withComplaint };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosave controller (DC05)", () => {
  it("debounces: only the last edit inside the interval is saved, with the base version", async () => {
    const h = harness();
    h.c.edit(h.withComplaint("a"));
    await vi.advanceTimersByTimeAsync(500);
    h.c.edit(h.withComplaint("ab"));
    await vi.advanceTimersByTimeAsync(799);
    expect(h.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.calls[0].input.expectedVersion).toBe(4);
    expect(h.calls[0].input.content.assessment.chiefComplaint).toBe("ab");
    h.calls[0].resolve({ ok: true, data: { version: 5, savedAt: SAVED_AT } });
    await vi.runAllTimersAsync();
    expect(h.c.getSnapshot().draft).toMatchObject({ status: "saved", serverVersion: 5 });
    expect(canFinalize(h.c.getSnapshot().draft)).toBe(true);
  });

  it("serializes writes: edits during a save are sent next, on the new version", async () => {
    const h = harness();
    h.c.edit(h.withComplaint("one"));
    h.c.saveNow();
    expect(h.save).toHaveBeenCalledTimes(1);
    h.c.edit(h.withComplaint("two"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.save).toHaveBeenCalledTimes(1); // still waiting on the first response
    h.calls[0].resolve({ ok: true, data: { version: 5, savedAt: SAVED_AT } });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.calls[1].input).toMatchObject({ expectedVersion: 5 });
    expect(h.calls[1].input.content.assessment.chiefComplaint).toBe("two");
  });

  it("conflict stops autosave, fetches the server draft and resolves by explicit choice", async () => {
    const server: DraftSnapshot = { consultationId: "c1", bookingId: "b1", status: "draft", version: 7, savedAt: SAVED_AT, content: { ...emptyDraftContent(), assessment: { chiefComplaint: "theirs" } } };
    const h = harness({ fetchLatest: async () => ({ ok: true, data: server }) });
    h.c.edit(h.withComplaint("mine"));
    h.c.saveNow();
    h.calls[0].resolve({ ok: false, error: { code: "conflict" } });
    await vi.advanceTimersByTimeAsync(0);
    const snap = h.c.getSnapshot();
    expect(snap.draft.status).toBe("conflict");
    expect(h.fetchLatest).toHaveBeenCalledTimes(1);
    expect(snap.conflict).toEqual({ phase: "review", server, changedSteps: ["assessment"], editSeq: 1 });
    h.c.edit(h.withComplaint("mine more"));
    // The clinician reviewed seq 1; seq 2 was typed afterwards, so take_server must not drop it.
    h.c.resolveConflict("take_server", 1);
    expect(h.c.getSnapshot().draft.status).toBe("conflict");
    expect(h.c.getSnapshot().conflict).toMatchObject({ phase: "review", editSeq: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.save).toHaveBeenCalledTimes(1); // no blind autosave during conflict
    h.c.resolveConflict("keep_local", 2);
    expect(h.c.getSnapshot().conflict).toBeNull();
    expect(h.c.getSnapshot().draft).toMatchObject({ status: "unsaved", serverVersion: 7 });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.calls[1].input.expectedVersion).toBe(7);
    expect(h.calls[1].input.content.assessment.chiefComplaint).toBe("mine more");
  });

  it("conflict fetch failure is surfaced and can be retried", async () => {
    const h = harness();
    h.c.edit(h.withComplaint("x"));
    h.c.saveNow();
    h.calls[0].resolve({ ok: false, error: { code: "conflict" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.c.getSnapshot().conflict).toEqual({ phase: "error", code: "unavailable" });
    h.c.resolveConflict("take_server", 1); // not allowed without a reviewed server version
    expect(h.c.getSnapshot().draft.status).toBe("conflict");
    h.c.reloadConflict();
    expect(h.fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("retries transient failures with bounded backoff, then stops", async () => {
    const h = harness();
    h.c.edit(h.withComplaint("x"));
    h.c.saveNow();
    h.calls[0].resolve({ ok: false, error: { code: "unavailable" } });
    await vi.advanceTimersByTimeAsync(1599);
    expect(h.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 800 * 2^1
    expect(h.save).toHaveBeenCalledTimes(2);
    h.calls[1].resolve({ ok: false, error: { code: "unavailable" } });
    await vi.advanceTimersByTimeAsync(3200);
    expect(h.save).toHaveBeenCalledTimes(3);
    h.calls[2].resolve({ ok: false, error: { code: "unavailable" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.save).toHaveBeenCalledTimes(3);
    expect(h.c.getSnapshot().draft).toMatchObject({ status: "failed", autosaveEnabled: false });
    h.c.saveNow(); // manual save still allowed
    expect(h.save).toHaveBeenCalledTimes(4);
  });

  it("thrown save errors count as unavailable; offline pauses; detach stops timers", async () => {
    const h = harness();
    h.c.setOnline(false);
    h.c.edit(h.withComplaint("x"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.c.getSnapshot().draft.status).toBe("offline");
    h.c.setOnline(true);
    h.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("finalized editor never autosaves again", async () => {
    const h = harness();
    h.c.markFinalized();
    h.c.edit(h.withComplaint("late"));
    h.c.saveNow();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.save).not.toHaveBeenCalled();
  });
});

describe("diffDraftSteps", () => {
  it("ignores key order and undefined, reports changed steps only", () => {
    const a = { ...emptyDraftContent(), vitals: { pulseBpm: 80, heightCm: undefined } };
    const b = { ...emptyDraftContent(), vitals: { pulseBpm: 80 } };
    expect(diffDraftSteps(a, b)).toEqual([]);
    expect(diffDraftSteps(a, { ...b, care: { advice: "x" } })).toEqual(["care"]);
  });
});
