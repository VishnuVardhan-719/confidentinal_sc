import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import type { FamilyMembersApi } from "./api";
import { validateFamilyInput, versionSchema } from "./schemas";
import { MAX_FAMILY_MEMBERS, type FamilyMember } from "./types";

type Store = { members: Map<string, FamilyMember>; keys: Map<string, string> };
type World = Map<string, Store>;

const WORLD_KEY = Symbol.for("scv.fixture.familyMembers");
const idSchema = z.uuid();

/** Seeded synthetic dependent (fixture only; not a real person). */
export const SYNTHETIC_FAMILY_MEMBER_ID = "00000000-0000-4000-8000-0000000000f1";

function seed(): FamilyMember[] {
  return [
    {
      id: SYNTHETIC_FAMILY_MEMBER_ID,
      displayName: "Synthetic Parent (fixture)",
      relation: "parent",
      dateOfBirth: "1958-04-12",
      version: 1,
      updatedAt: "2026-11-01T04:30:00.000Z",
      synthetic: true,
    },
  ];
}

/** Process-wide synthetic store so a save is visible on the next request (like the clinical world). */
function storeFor(ownerId: string, scenario: "empty" | "seeded"): Store {
  const g = globalThis as typeof globalThis & { [WORLD_KEY]?: World };
  g[WORLD_KEY] ??= new Map();
  let store = g[WORLD_KEY].get(ownerId);
  if (!store) {
    store = { members: new Map(scenario === "empty" ? [] : seed().map((m) => [m.id, m])), keys: new Map() };
    g[WORLD_KEY].set(ownerId, store);
  }
  return store;
}

export type FamilyFixtureOptions = {
  env?: FixtureEnvironment;
  /** Owner from the fixture session; null = signed out (every call is refused). */
  ownerId: string | null;
  scenario?: "empty" | "seeded";
  now?: () => Date;
};

/** Synthetic family members adapter. Simulates owner-only access; not a security boundary. */
export function createFamilyMembersFixtureApi(options: FamilyFixtureOptions): FamilyMembersApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const owner = options.ownerId;
  const store = () => (owner ? storeFor(owner, options.scenario ?? "seeded") : null);
  const copy = (m: FamilyMember) => structuredClone(m);

  return {
    async list() {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      return ok([...s.members.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)).map(copy));
    },
    async get(id) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      // Unknown and other-owner ids look the same.
      const m = idSchema.safeParse(id).success ? s.members.get(id.toLowerCase()) : undefined;
      return m ? ok(copy(m)) : fail("not_found");
    },
    async create(input, key) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (typeof key !== "string" || key.length < 8 || key.length > 128) return fail("validation");
      const prior = s.keys.get(key);
      if (prior && s.members.has(prior)) return ok(copy(s.members.get(prior)!)); // idempotent retry
      const v = validateFamilyInput(input);
      if (!v.ok) return fail("validation", { fields: Object.fromEntries(v.issues.map((i) => [i.field, i.code])) });
      if (s.members.size >= MAX_FAMILY_MEMBERS) return fail("conflict");
      const m: FamilyMember = { id: globalThis.crypto.randomUUID(), ...v.data, version: 1, updatedAt: now().toISOString(), synthetic: true };
      s.members.set(m.id, m);
      s.keys.set(key, m.id);
      return ok(copy(m));
    },
    async update(id, input, expectedVersion) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!idSchema.safeParse(id).success || !versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const m = s.members.get(id.toLowerCase());
      if (!m) return fail("not_found");
      const v = validateFamilyInput(input);
      if (!v.ok) return fail("validation", { fields: Object.fromEntries(v.issues.map((i) => [i.field, i.code])) });
      if (m.version !== expectedVersion) return fail("conflict");
      const next: FamilyMember = { ...m, ...v.data, version: m.version + 1, updatedAt: now().toISOString() };
      s.members.set(m.id, next);
      return ok(copy(next));
    },
    async remove(id, expectedVersion) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!idSchema.safeParse(id).success || !versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const m = s.members.get(id.toLowerCase());
      if (!m) return fail("not_found");
      if (m.version !== expectedVersion) return fail("conflict");
      s.members.delete(m.id);
      return ok({ id: m.id });
    },
  };
}
