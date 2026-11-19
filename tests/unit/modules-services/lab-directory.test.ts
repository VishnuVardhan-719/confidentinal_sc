import { describe, expect, it } from "vitest";
import { readLabFilter } from "@/components/directory/lab-directory";
import { createLabDirectoryApi, createLabDirectoryFixtureApi, createLabDirectoryHttpApi, matchingTests } from "@/modules/lab-orders/directory";
import { SYNTHETIC_LABS } from "@/modules/lab-orders/fixture";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };

describe("public lab directory", () => {
  const api = createLabDirectoryFixtureApi(SYNTHETIC_LABS, env);

  it("lists every synthetic lab with its cities, integer-paise prices and collection options", async () => {
    const all = await api.list({});
    expect(all.ok && all.data.items.map(lab => lab.name)).toEqual(["Synthetic lab 1", "Synthetic lab 2", "Synthetic lab 3"]);
    expect(all.ok && all.data.cities).toEqual(["Hyderabad", "Secunderabad"]);
    expect(all.ok && all.data.synthetic).toBe(true);
    expect(all.ok && all.data.items.every(lab => lab.tests.every(test => Number.isSafeInteger(test.pricePaise)) && lab.collectionOptions.length > 0)).toBe(true);
  });

  it("filters by test name (case and spacing ignored) and by city", async () => {
    const cbc = await api.list({ test: "  blood   COUNT " });
    expect(cbc.ok && cbc.data.items.map(lab => lab.name)).toEqual(["Synthetic lab 1", "Synthetic lab 2"]);
    const both = await api.list({ test: "blood count", city: "secunderabad" });
    expect(both.ok && both.data.items.map(lab => lab.name)).toEqual(["Synthetic lab 2"]);
    const none = await api.list({ test: "unknown test" });
    expect(none.ok && none.data.items).toEqual([]);
    expect(matchingTests(SYNTHETIC_LABS[0], "thyroid").map(test => test.name)).toEqual(["Thyroid profile (T3, T4, TSH)"]);
    expect((await api.list({ test: "x" })).ok).toBe(false);
  });

  it("gets one lab by id and reports unknown ids as not found", async () => {
    const lab = await api.get(SYNTHETIC_LABS[0].id);
    expect(lab.ok && lab.data.tests).toHaveLength(4);
    expect(lab.ok && Object.keys(lab.data).sort()).toEqual(["area", "collectionFeePaise", "collectionOptions", "id", "name", "synthetic", "tests"]);
    const unknown = await api.get("00000000-0000-4000-8200-000000000099");
    expect(!unknown.ok && unknown.error.code).toBe("not_found");
    const junk = await api.get("__sample__");
    expect(!junk.ok && junk.error.code).toBe("not_found");
  });

  it("is refused in production and fails closed over HTTP", async () => {
    expect(() => createLabDirectoryFixtureApi(SYNTHETIC_LABS, { ...env, APP_ENV: "production" })).toThrow();
    const http = createLabDirectoryHttpApi();
    const listed = await http.list({});
    expect(!listed.ok && listed.error.code).toBe("gated");
    const chosen = await createLabDirectoryApi({ APP_ENV: "test" });
    const result = await chosen.list({});
    expect(!result.ok && result.error.code).toBe("gated");
  });

  it("reads only the test and city filters from the URL", () => {
    expect(readLabFilter({ test: " thyroid ", city: "Hyderabad", patientId: "x" })).toEqual({ filter: { test: "thyroid", city: "Hyderabad" }, testInvalid: false, raw: { test: "thyroid", city: "Hyderabad" } });
    expect(readLabFilter({ test: "a" }).testInvalid).toBe(true);
    expect(readLabFilter({ test: ["cbc", "x"] }).filter).toEqual({ test: "cbc" });
  });
});
