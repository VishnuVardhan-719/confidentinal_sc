import { describe, expect, it } from "vitest";
import { createSavedProvidersFixtureApi, SEEDED_SAVED_PROVIDER_ID } from "@/modules/saved-providers/fixture";
import { createSavedProvidersHttpApi } from "@/modules/saved-providers/http";
import { MAX_SAVED_PROVIDERS } from "@/modules/saved-providers/types";
import { SYNTHETIC_DOCTORS } from "@/fixtures/marketplace/doctors";

const ENV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const DOCTOR_2 = "00000000-0000-4000-8000-000000000101";
let n = 0;
const owner = () => `saved-owner-${Date.now()}-${n++}`;

describe("saved providers fixture adapter", () => {
  it("refuses signed-out callers", async () => {
    const api = createSavedProvidersFixtureApi({ env: ENV, ownerId: null });
    expect(await api.list()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(await api.save(DOCTOR_2, "key-12345678")).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });

  it("seeds one saved doctor, or none in the empty scenario", async () => {
    const seeded = await createSavedProvidersFixtureApi({ env: ENV, ownerId: owner() }).list();
    expect(seeded.ok && seeded.data.map((r) => r.providerId)).toEqual([SEEDED_SAVED_PROVIDER_ID]);
    const empty = await createSavedProvidersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" }).list();
    expect(empty.ok && empty.data).toEqual([]);
  });

  it("save and unsave are idempotent and persist for the same owner only", async () => {
    const id = owner();
    const api = createSavedProvidersFixtureApi({ env: ENV, ownerId: id, scenario: "empty" });
    const a = await api.save(DOCTOR_2.toUpperCase(), "key-aaaaaaaa");
    const b = await api.save(DOCTOR_2, "key-bbbbbbbb");
    expect(a.ok && b.ok && a.data.savedAt === b.data.savedAt && a.data.providerId === DOCTOR_2).toBe(true);
    const again = await createSavedProvidersFixtureApi({ env: ENV, ownerId: id, scenario: "empty" }).list();
    expect(again.ok && again.data).toHaveLength(1);
    const other = await createSavedProvidersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" }).list();
    expect(other.ok && other.data).toEqual([]);
    expect(await api.unsave(DOCTOR_2)).toEqual({ ok: true, data: { providerId: DOCTOR_2, saved: false } });
    expect(await api.unsave(DOCTOR_2)).toEqual({ ok: true, data: { providerId: DOCTOR_2, saved: false } });
  });

  it("rejects malformed ids and keys, and unknown providers", async () => {
    const api = createSavedProvidersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" });
    expect(await api.save("not-a-uuid", "key-12345678")).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await api.save(DOCTOR_2, "short")).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await api.save("00000000-0000-4000-8000-000000000999", "key-12345678")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await api.unsave("x")).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it("only listed synthetic doctors exist, so the limit is above the directory size", () => {
    expect(SYNTHETIC_DOCTORS.length).toBeLessThan(MAX_SAVED_PROVIDERS);
  });

  it("is refused in production", () => {
    expect(() => createSavedProvidersFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "production" }, ownerId: "x" })).toThrow();
  });
});

describe("saved providers http adapter", () => {
  it("fails closed as gated", async () => {
    const api = createSavedProvidersHttpApi();
    for (const r of [await api.list(), await api.save(DOCTOR_2, "key-12345678"), await api.unsave(DOCTOR_2)]) expect(r).toEqual({ ok: false, error: { code: "gated" } });
  });
});
