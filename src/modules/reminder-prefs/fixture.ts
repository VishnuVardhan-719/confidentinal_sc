import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import type { ReminderPrefsApi } from "./api";
import { validateReminderPrefs, versionSchema } from "./schemas";
import type { ReminderPrefs } from "./types";

const WORLD_KEY = Symbol.for("scv.fixture.reminderPrefs");

/** Defaults proposed for new accounts (needs product confirmation): SMS on, quiet 21:00-07:00 IST. */
export function defaultReminderPrefs(): ReminderPrefs {
  return {
    channels: { sms: true, whatsapp: false, email: false },
    quietHours: { enabled: true, start: "21:00", end: "07:00" },
    version: 1,
    updatedAt: "2026-11-01T04:30:00.000Z",
  };
}

function storeFor(ownerId: string): { prefs: ReminderPrefs } {
  const g = globalThis as typeof globalThis & { [WORLD_KEY]?: Map<string, { prefs: ReminderPrefs }> };
  g[WORLD_KEY] ??= new Map();
  let s = g[WORLD_KEY].get(ownerId);
  if (!s) {
    s = { prefs: defaultReminderPrefs() };
    g[WORLD_KEY].set(ownerId, s);
  }
  return s;
}

export type ReminderFixtureOptions = { env?: FixtureEnvironment; ownerId: string | null; now?: () => Date };

/** Synthetic reminder-preferences adapter (owner-scoped, version-checked). Not a security boundary. */
export function createReminderPrefsFixtureApi(options: ReminderFixtureOptions): ReminderPrefsApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const store = () => (options.ownerId ? storeFor(options.ownerId) : null);
  return {
    async get() {
      guard();
      const s = store();
      return s ? ok(structuredClone(s.prefs)) : fail("unauthenticated");
    },
    async update(input, expectedVersion) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const v = validateReminderPrefs(input);
      if (!v.ok) return fail("validation", v.issues.length ? { fields: Object.fromEntries(v.issues.map((i) => [i.field, i.code])) } : {});
      if (s.prefs.version !== expectedVersion) return fail("conflict");
      s.prefs = { ...v.data, version: s.prefs.version + 1, updatedAt: now().toISOString() };
      return ok(structuredClone(s.prefs));
    },
  };
}
