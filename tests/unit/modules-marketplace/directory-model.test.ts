import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
import { applyDirectoryDraft, directoryCard, readDirectoryQuery } from "@/modules/providers/directory-model";
import { createDirectoryController } from "@/modules/providers/directory-controller";
import type { ProviderPage } from "@/modules/providers/schemas";
import type { ApiResult } from "@/lib/api/result";

describe("directory route model", () => {
  it("requires PIN without guessing coverage and rejects private, duplicate and cross-category URL fields", () => {
    expect(readDirectoryQuery("doctor", new URLSearchParams()).kind).toBe("needs_pin");
    for (const query of ["pin=500001&pin=500002", "pin=500001&patientId=secret", "category=lab&pin=500001", "pin=123"]) {
      expect(readDirectoryQuery("doctor", new URLSearchParams(query)).kind).toBe("invalid");
    }
  });
  it("applies a validated mobile draft and resets pagination", () => {
    const applied = applyDirectoryDraft("doctor", { pin: "500001", priceMax: "50000", sort: "price_asc" });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.data.get("pin")).toBe("500001");
      expect(applied.data.has("cursor")).toBe(false);
      expect(applied.data.has("category")).toBe(false);
    }
    expect(applyDirectoryDraft("lab", { pin: "", priceMax: "", sort: "price_asc" })).toEqual(ok(new URLSearchParams()));
  });
  it("projects truthful cards with locale and PIN scoped profile links", () => {
    const card = directoryCard(syntheticProvider("doctor"), "te");
    expect(card.href).toContain("/te/doctors/");
    expect(card.href).toContain("?pin=500001");
    expect(card.availability).toBe("advisory_only");
    expect(card.acceptance).toBe("manual");
    expect(card.synthetic).toBe(true);
  });
});

describe("directory requests", () => {
  it("aborts superseded requests and ignores late responses", async () => {
    const pending: ((value: ApiResult<ProviderPage>) => void)[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const list = vi.fn((_filters, options?: { signal?: AbortSignal }) => {
      signals.push(options?.signal);
      return new Promise<ApiResult<ProviderPage>>(resolve => pending.push(resolve));
    });
    const store = createDirectoryController({ list });
    const first = store.load({ category: "doctor", pin: "500001" });
    const second = store.load({ category: "lab", pin: "500001" });
    expect(signals[0]?.aborted).toBe(true);
    pending[1](ok({ items: [syntheticProvider("lab")], nextCursor: null, synthetic: true }));
    await second;
    const current = store.getSnapshot();
    pending[0](fail("unavailable")); await first;
    expect(store.getSnapshot()).toBe(current);
    expect(current.phase).toBe("ready");
    expect(Object.isFrozen(current)).toBe(true);
  });
  it("retains stale results while loading and clears everything on disposal", async () => {
    const list = vi.fn().mockResolvedValue(ok({ items: [syntheticProvider("doctor")], nextCursor: null, synthetic: true }));
    const store = createDirectoryController({ list });
    await store.load({ category: "doctor", pin: "500001" });
    list.mockImplementation(() => new Promise(() => {}));
    void store.load({ category: "doctor", pin: "500002" });
    expect(store.getSnapshot().phase).toBe("loading");
    expect(store.getSnapshot().page?.items).toHaveLength(1);
    store.dispose();
    expect(store.getSnapshot()).toEqual({ phase: "disposed" });
  });
});
