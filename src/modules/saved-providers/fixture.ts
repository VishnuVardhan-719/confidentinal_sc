import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { SYNTHETIC_DOCTORS } from "@/fixtures/marketplace/doctors";
import type { SavedProvidersApi } from "./api";
import { idempotencyKeySchema, providerIdSchema } from "./schemas";
import { MAX_SAVED_PROVIDERS, type SavedProvider } from "./types";

type World = Map<string, Map<string, SavedProvider>>;
const WORLD_KEY = Symbol.for("scv.fixture.savedProviders");

/** Seeded saved doctor (synthetic directory row "Synthetic doctor 1"). */
export const SEEDED_SAVED_PROVIDER_ID = "00000000-0000-4000-8000-000000000001";

function storeFor(ownerId: string, scenario: "empty" | "seeded"): Map<string, SavedProvider> {
  const g = globalThis as typeof globalThis & { [WORLD_KEY]?: World };
  g[WORLD_KEY] ??= new Map();
  let store = g[WORLD_KEY].get(ownerId);
  if (!store) {
    store = new Map(scenario === "empty" ? [] : [[SEEDED_SAVED_PROVIDER_ID, { providerId: SEEDED_SAVED_PROVIDER_ID, savedAt: "2026-11-10T05:00:00.000Z" }]]);
    g[WORLD_KEY].set(ownerId, store);
  }
  return store;
}

export type SavedFixtureOptions = { env?: FixtureEnvironment; ownerId: string | null; scenario?: "empty" | "seeded"; now?: () => Date };

/** Synthetic saved-doctors adapter. Only ids of listed synthetic doctors can be saved. Not a security boundary. */
export function createSavedProvidersFixtureApi(options: SavedFixtureOptions): SavedProvidersApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const store = () => (options.ownerId ? storeFor(options.ownerId, options.scenario ?? "seeded") : null);
  const listed = new Set(SYNTHETIC_DOCTORS.map((d) => d.providerId));

  return {
    async list() {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      return ok([...s.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((r) => ({ ...r })));
    },
    async save(providerId, key) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      const id = providerIdSchema.safeParse(providerId);
      if (!id.success || !idempotencyKeySchema.safeParse(key).success) return fail("validation");
      const existing = s.get(id.data);
      if (existing) return ok({ ...existing }); // idempotent
      // Unknown or unlisted providers look the same as missing ones.
      if (!listed.has(id.data)) return fail("not_found");
      if (s.size >= MAX_SAVED_PROVIDERS) return fail("conflict");
      const row = { providerId: id.data, savedAt: now().toISOString() };
      s.set(id.data, row);
      return ok({ ...row });
    },
    async unsave(providerId) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      const id = providerIdSchema.safeParse(providerId);
      if (!id.success) return fail("validation");
      s.delete(id.data); // idempotent: removing an unsaved doctor still succeeds
      return ok({ providerId: id.data, saved: false as const });
    },
  };
}
