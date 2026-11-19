import { fail, ok } from "@/lib/api/result";
import { assertFixtureAllowed, clone, NO_ACTOR, sharedClinicalWorld, type ClinicalWorld, type FixtureActor, type FixtureBooking } from "@/fixtures/clinical/world";
import type { PrescriptionDraftsApi } from "./api";
import { discardDraftInputSchema, prescriptionDraftSchema, saveDraftInputSchema, type PrescriptionDraft } from "./types";

type Env = Record<string, string | undefined>;
type Store = Map<string, PrescriptionDraft>;

const GLOBAL_KEY = Symbol.for("scv.fixture.prescriptionDrafts");
function sharedStore(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  g[GLOBAL_KEY] ??= new Map();
  return g[GLOBAL_KEY];
}
export const createDraftsTestStore = (): Store => new Map();

/** Synthetic drafts over the shared clinical world. Same rules the backend must enforce. */
export function createPrescriptionDraftsFixtureApi({
  env = process.env,
  actor = NO_ACTOR,
  world = sharedClinicalWorld(),
  store = sharedStore(),
  now = () => new Date(),
}: { env?: Env; actor?: FixtureActor; world?: ClinicalWorld; store?: Store; now?: () => Date } = {}): PrescriptionDraftsApi {
  assertFixtureAllowed(env);
  const doctorId = actor.role === "doctor" ? actor.doctorId : null;
  const booking = (id: string): FixtureBooking | null => {
    const b = doctorId ? world.bookings.get(id) : undefined;
    return b && b.assignedDoctorId === doctorId ? b : null;
  };

  return {
    getDraft: async (id) => {
      if (!booking(id)) return fail("forbidden");
      const d = store.get(id);
      return ok(d ? clone(d) : null);
    },
    saveDraft: async (id, input) => {
      const b = booking(id);
      if (!b) return fail("forbidden");
      if (b.state !== "completed") return fail("conflict");
      const parsed = saveDraftInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const current = store.get(id);
      if ((current?.version ?? 0) !== parsed.data.expectedVersion) return fail("conflict");
      const next = prescriptionDraftSchema.parse({ bookingId: id, status: "draft", version: (current?.version ?? 0) + 1, items: parsed.data.items, updatedAt: now().toISOString() });
      store.set(id, next);
      return ok(clone(next));
    },
    discardDraft: async (id, input) => {
      if (!booking(id)) return fail("forbidden");
      const parsed = discardDraftInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const current = store.get(id);
      if (!current || current.version !== parsed.data.expectedVersion) return fail("conflict");
      store.delete(id);
      return ok(null);
    },
  };
}
