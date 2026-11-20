import { z } from "zod";
import { getAdapterMode } from "@/lib/api/mode";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import type { LabProvider } from "./types";

/**
 * Public, read-only lab directory (no sign-in): labs, the tests they offer with provider-set prices in integer
 * paise, and how samples are collected. No private address, phone or staff data. The fixture reads the same
 * synthetic labs as patient lab orders, so a lab found here can be requested at /patient/lab-tests.
 * docs/API_CONTRACTS.md has no public lab read yet; the HTTP adapter fails closed (proposed in REQUESTS.md).
 */
export const labDirectoryFilterSchema = z.strictObject({
  test: z.string().trim().min(2).max(60).optional(),
  city: z.string().trim().min(2).max(60).optional(),
});
export type LabDirectoryFilter = z.infer<typeof labDirectoryFilterSchema>;
export type LabListing = Pick<LabProvider, "id" | "name" | "area" | "collectionOptions" | "collectionFeePaise" | "tests" | "synthetic">;

export interface LabDirectoryApi {
  list(filter: LabDirectoryFilter): Promise<ApiResult<{ items: LabListing[]; cities: string[]; synthetic: boolean }>>;
  get(id: string): Promise<ApiResult<LabListing>>;
}

const normalise = (value: string) => value.toLocaleLowerCase("en-IN").replace(/\s+/g, " ").trim();
const listing = ({ id, name, area, collectionOptions, collectionFeePaise, tests, synthetic }: LabProvider): LabListing =>
  structuredClone({ id, name, area, collectionOptions, collectionFeePaise, tests, synthetic });

/** Tests of a lab that match the test filter (all tests when there is none). */
export function matchingTests(lab: Pick<LabListing, "tests">, test?: string) {
  const q = test ? normalise(test) : "";
  return q ? lab.tests.filter(item => normalise(item.name).includes(q)) : lab.tests;
}

export function createLabDirectoryFixtureApi(labs: readonly LabProvider[], env?: FixtureEnvironment): LabDirectoryApi {
  const guard = fixtureGuard(env);
  return {
    async list(filter) {
      guard();
      const parsed = labDirectoryFilterSchema.safeParse(filter ?? {});
      if (!parsed.success) return fail("validation");
      const { test, city } = parsed.data;
      const items = labs.filter(lab => (!city || normalise(lab.area.city) === normalise(city)) && matchingTests(lab, test).length > 0).map(listing);
      const cities = [...new Set(labs.map(lab => lab.area.city))].sort((a, b) => a.localeCompare(b, "en-IN"));
      return ok({ items, cities, synthetic: true });
    },
    async get(id) {
      guard();
      if (!z.uuid().safeParse(id).success) return fail("not_found");
      const lab = labs.find(item => item.id === id.toLowerCase());
      return lab ? ok(listing(lab)) : fail("not_found");
    },
  };
}

export function createLabDirectoryHttpApi(): LabDirectoryApi {
  return {
    async list(filter) { return fail(labDirectoryFilterSchema.safeParse(filter ?? {}).success ? "gated" : "validation"); },
    async get(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "not_found"); },
  };
}

/** Server-only factory. Fixture data is refused in production by the fixture guard. */
export async function createLabDirectoryApi(env: FixtureEnvironment = process.env): Promise<LabDirectoryApi> {
  if (getAdapterMode(env) !== "fixture") return createLabDirectoryHttpApi();
  const { SYNTHETIC_LABS } = await import("./fixture");
  return createLabDirectoryFixtureApi(SYNTHETIC_LABS, env);
}
