import { describe, expect, it, vi } from "vitest";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { createHttpClient } from "@/lib/api/http";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
import { applyDirectoryDraft, directoryDraftFromQuery, readDirectoryQuery } from "@/modules/providers/directory-model";
import { createDirectoryController } from "@/modules/providers/directory-controller";
import { loadDirectory, loadProviderProfile } from "@/modules/providers/server-loaders";
import { createProvidersFixtureApi } from "@/modules/providers/fixture";
import { createProvidersHttpApi } from "@/modules/providers/http";
import { createProvidersApi } from "@/modules/providers/api";
import type { ProviderPage } from "@/modules/providers/schemas";

const env = { APP_ENV: "test", FRONTEND_ADAPTER: "fixture" };
const provider = syntheticProvider("doctor");
const filters = { category: "doctor" as const, pin: "500001" };

describe("directory draft branches", () => {
  it("restores an applied draft on cancel and preserves zero price cap", () => {
    const query = readDirectoryQuery("doctor", new URLSearchParams("category=doctor&pin=500001&priceMax=0&sort=price_desc"));
    expect(directoryDraftFromQuery(query)).toEqual({ pin: "500001", priceMax: "0", sort: "price_desc" });
    const withoutCap = readDirectoryQuery("doctor", new URLSearchParams("pin=500001"));
    expect(directoryDraftFromQuery(withoutCap).priceMax).toBe("");
    expect(directoryDraftFromQuery({ kind: "invalid" })).toEqual({ pin: "", priceMax: "", sort: "price_asc" });
    expect(readDirectoryQuery("doctor", new URLSearchParams("category=doctor"))).toEqual({ kind: "needs_pin" });
    expect(readDirectoryQuery("doctor", new URLSearchParams("sort=price_asc"))).toEqual({ kind: "invalid" });
  });
  it.each([
    { pin: "500001", priceMax: "-1", sort: "price_asc" },
    { pin: "500001", priceMax: "1.5", sort: "price_asc" },
    { pin: "", priceMax: "100", sort: "price_asc" },
    { pin: "500001", priceMax: "", sort: "distance" },
    { pin: "500001", priceMax: "", sort: "price_asc", patientId: "private" },
  ])("rejects invalid filter drafts before navigation: %j", draft => {
    expect(applyDirectoryDraft("doctor", draft)).toEqual(fail("validation"));
  });
});

describe("directory controller recovery", () => {
  it("validates before network, sanitizes thrown errors, notifies only subscribed consumers", async () => {
    const list = vi.fn().mockRejectedValue(new Error("private transport detail"));
    const controller = createDirectoryController({ list });
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    await controller.load({ ...filters, pin: "bad" });
    expect(controller.getSnapshot()).toEqual({ phase: "error", error: { code: "validation" } });
    expect(list).not.toHaveBeenCalled();
    await controller.load(filters);
    expect(controller.getSnapshot()).toEqual({ phase: "error", error: { code: "unavailable" } });
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe(); controller.clear(); expect(listener).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot()).toEqual({ phase: "idle" });
    controller.dispose(); const disposed = controller.getSnapshot();
    await controller.load(filters); controller.clear();
    expect(controller.getSnapshot()).toBe(disposed); expect(list).toHaveBeenCalledTimes(1);
  });
  it.each(["clear", "dispose"] as const)("%s aborts in-flight work and ignores a late successful result", async action => {
    const pending = Promise.withResolvers<ApiResult<ProviderPage>>();
    let signal: AbortSignal | undefined;
    const controller = createDirectoryController({ list: async (_filters, options) => { signal = options?.signal; return pending.promise; } });
    const running = controller.load(filters); controller[action]();
    expect(signal?.aborted).toBe(true);
    const cleared = controller.getSnapshot();
    pending.resolve(ok({ items: [provider], nextCursor: null, synthetic: true })); await running;
    expect(controller.getSnapshot()).toBe(cleared);
    expect(cleared.page).toBeUndefined();
  });
});

describe("public loader scope and failures", () => {
  it("projects a valid directory and profile without adapter-private extras", async () => {
    const row = { ...provider, privateContact: "synthetic private value" };
    const api = { list: vi.fn().mockResolvedValue(ok({ items: [row], nextCursor: null, synthetic: true })), get: vi.fn().mockResolvedValue(ok({ items: [row], synthetic: true })) };
    const directory = await loadDirectory(api, "doctor", new URLSearchParams("pin=500001"), "en");
    expect(directory.kind).toBe("ready");
    const profile = await loadProviderProfile(api, provider.id, "doctor", provider.pin, "hi");
    expect(profile.ok).toBe(true);
    expect(JSON.stringify([directory, profile])).not.toContain("privateContact");
    expect(JSON.stringify([directory, profile])).not.toContain("synthetic private value");
  });
  it.each([
    { ...provider, category: "lab" }, { ...provider, pin: "500002" }, { ...provider, amountPaise: -1 },
  ])("rejects wrong-scope or malformed catalog rows: %j", async row => {
    const api = { list: vi.fn().mockResolvedValue(ok({ items: [row], nextCursor: null, synthetic: true })) };
    expect(await loadDirectory(api, "doctor", new URLSearchParams("pin=500001"), "en")).toEqual({ kind: "error", error: { code: "unavailable" } });
  });
  it.each([
    { ...provider, id: "00000000-0000-4000-8000-000000000009" }, { ...provider, category: "lab" },
    { ...provider, pin: "500002" }, { ...provider, amountPaise: -1 },
  ])("rejects mismatched/malformed profile rows: %j", async row => {
    const api = { get: vi.fn().mockResolvedValue(ok({ items: [row], synthetic: true })) };
    expect(await loadProviderProfile(api, provider.id, "doctor", provider.pin, "en")).toEqual(fail("unavailable"));
  });
  it("keeps denied, empty and transport-error profiles distinct", async () => {
    const get = vi.fn().mockResolvedValueOnce(fail("forbidden")).mockResolvedValueOnce(ok({ items: [], synthetic: true })).mockRejectedValueOnce(new Error("private"));
    expect(await loadProviderProfile({ get }, provider.id, "doctor", provider.pin, "en")).toEqual(fail("forbidden"));
    expect(await loadProviderProfile({ get }, provider.id, "doctor", provider.pin, "en")).toEqual(fail("not_found"));
    expect(await loadProviderProfile({ get }, provider.id, "doctor", provider.pin, "en")).toEqual(fail("unavailable"));
    const list = vi.fn().mockRejectedValue(new Error("private"));
    expect(await loadDirectory({ list }, "doctor", new URLSearchParams("pin=500001"), "en")).toEqual({ kind: "error", error: { code: "unavailable" } });
  });
});

describe("provider adapter boundary branches", () => {
  it("forwards the abort signal and rejects invalid requests without fetch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 503 }));
    const api = createProvidersHttpApi(createHttpClient({ fetch }));
    const abort = new AbortController();
    await api.list(filters, { signal: abort.signal });
    const forwarded = fetch.mock.calls[0]?.[1]?.signal;
    expect(forwarded?.aborted).toBe(false); abort.abort();
    // Transport detaches the caller listener once the request finishes.
    expect(forwarded?.aborted).toBe(false);
    expect(await api.list({ ...filters, pin: "bad" })).toEqual(fail("validation"));
    expect(await api.get(provider.id, { ...filters, pin: "bad" })).toEqual(fail("validation"));
    expect(await api.get(provider.id, filters)).toEqual(fail("unavailable"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("propagates caller cancellation while an HTTP directory request is active", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }));
    const api = createProvidersHttpApi(createHttpClient({ fetch })); const abort = new AbortController();
    const running = api.list(filters, { signal: abort.signal });
    expect(fetch).toHaveBeenCalledTimes(1); abort.abort();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(await running).toEqual(fail("unavailable"));
  });
  it("handles cancelled fixture requests, price limits, pagination and unavailable profiles", async () => {
    const api = createProvidersFixtureApi({ env }); const abort = new AbortController(); abort.abort();
    expect(await api.list(filters, { signal: abort.signal })).toEqual(fail("unavailable"));
    expect(await api.list({ ...filters, pin: "bad" })).toEqual(fail("validation"));
    const capped = await api.list({ ...filters, priceMax: provider.amountPaise - 1 });
    expect(capped.ok && capped.data.items).toEqual([]);
    const paged = await api.list({ ...filters, cursor: "1," + provider.id + "," + provider.serviceId });
    expect(paged.ok && paged.data.items).toEqual([]);
    expect(await api.get("bad", filters)).toEqual(fail("validation"));
    expect(await api.get(provider.id, { ...filters, pin: "bad" })).toEqual(fail("validation"));
    expect(await createProvidersFixtureApi({ env, scenario: "suspended" }).get(provider.id, filters)).toEqual(fail("not_found"));
    expect(await api.get(provider.id, filters)).toEqual(ok({ items: [provider], synthetic: true }));
  });
  it("selects a guarded fixture factory and leaves HTTP as the default", async () => {
    expect(await createProvidersApi(env).get(provider.id, filters)).toEqual(ok({ items: [provider], synthetic: true }));
    expect(await createProvidersApi({ APP_ENV: "test" }).get("invalid", filters)).toEqual(fail("validation"));
    expect(() => createProvidersApi({ APP_ENV: "production", FRONTEND_ADAPTER: "fixture" })).toThrow();
  });
});
