import { describe, expect, it } from "vitest";
import { createAmbulanceDirectoryApi } from "@/modules/ambulance-requests/directory";
import { SYNTHETIC_AMBULANCE_OPERATORS } from "@/modules/ambulance-requests/fixture";
import { createCareDirectoryApi } from "@/modules/care-requests/directory";
import { SYNTHETIC_CARETAKERS } from "@/modules/care-requests/fixture";
import type { BaseProvider } from "@/modules/service-requests/core";
import { createPublicProviderDirectoryFixtureApi, createPublicProviderDirectoryHttpApi } from "@/modules/service-requests/public-directory";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const UNKNOWN_ID = "00000000-0000-4000-8200-000000000099";

describe.each([
  { name: "ambulance operators", providers: SYNTHETIC_AMBULANCE_OPERATORS as readonly BaseProvider[], create: createAmbulanceDirectoryApi },
  { name: "caretakers", providers: SYNTHETIC_CARETAKERS as readonly BaseProvider[], create: createCareDirectoryApi },
])("public directory: $name", ({ providers, create }) => {
  const api = createPublicProviderDirectoryFixtureApi(providers, env);

  it("lists every synthetic provider, flagged as synthetic", async () => {
    const all = await api.list({});
    expect(all.ok && all.data.items.map(item => item.id)).toEqual(providers.map(item => item.id));
    expect(all.ok && all.data.synthetic).toBe(true);
  });

  it("filters by a served PIN and returns nothing for a PIN no provider serves", async () => {
    const pin = providers[0].area.pins[0];
    const listed = await api.list({ pin });
    expect(listed.ok && listed.data.items.length).toBeGreaterThan(0);
    expect(listed.ok && listed.data.items.every(item => item.area.pins.includes(pin))).toBe(true);
    const none = await api.list({ pin: "999999" });
    expect(none.ok && none.data.items).toEqual([]);
  });

  it("rejects a malformed PIN instead of listing everything", async () => {
    const bad = await api.list({ pin: "12ab" });
    expect(!bad.ok && bad.error.code).toBe("validation");
  });

  it("gets one provider by id with the synthetic flag, and reports unknown or malformed ids as not found", async () => {
    const found = await api.get(providers[0].id);
    expect(found.ok && found.data.provider.id).toBe(providers[0].id);
    expect(found.ok && found.data.synthetic).toBe(true);
    for (const id of [UNKNOWN_ID, "__sample__", ""]) {
      const result = await api.get(id);
      expect(!result.ok && result.error.code, id).toBe("not_found");
    }
  });

  it("returns copies, so a caller cannot change the catalogue", async () => {
    const original = providers[0].name;
    const first = await api.get(providers[0].id);
    if (first.ok) first.data.provider.name = "Changed";
    const again = await api.get(providers[0].id);
    expect(again.ok && again.data.provider.name).toBe(original);
  });

  it("is refused in production, and fails closed over HTTP (no public provider read in API_CONTRACTS yet)", async () => {
    expect(() => createPublicProviderDirectoryFixtureApi(providers, { ...env, APP_ENV: "production" })).toThrow();
    const http = createPublicProviderDirectoryHttpApi<BaseProvider>();
    const listed = await http.list({});
    expect(!listed.ok && listed.error.code).toBe("gated");
    const invalid = await http.list({ pin: "12ab" });
    expect(!invalid.ok && invalid.error.code).toBe("validation");
    const got = await http.get(providers[0].id);
    expect(!got.ok && got.error.code).toBe("gated");
    const junk = await http.get("__sample__");
    expect(!junk.ok && junk.error.code).toBe("not_found");
    const chosen = await create({ APP_ENV: "test" });
    const result = await chosen.list({});
    expect(!result.ok && result.error.code).toBe("gated");
  });
});
