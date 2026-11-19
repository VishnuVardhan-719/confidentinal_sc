import { fail, ok } from "@/lib/api/result";
import { assertFixtureAllowed, clone, NO_ACTOR, sharedClinicalWorld, type ClinicalWorld, type FixtureActor, type FixtureBooking } from "@/fixtures/clinical/world";
import type { ConsultationNotesApi } from "./api";
import { consultationNoteSchema, missingForSignOff, saveNoteInputSchema, signOffInputSchema, type ConsultationNote } from "./types";

type Env = Record<string, string | undefined>;
type Store = Map<string, ConsultationNote>;

const GLOBAL_KEY = Symbol.for("scv.fixture.consultationNotes");
function sharedStore(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  g[GLOBAL_KEY] ??= new Map();
  return g[GLOBAL_KEY];
}

export const createNotesTestStore = (): Store => new Map();

/**
 * Synthetic notes over the shared clinical fixture world (bookings, assignment, doctor names).
 * Server-side rules mirror what the backend must enforce: assigned doctor, completed booking,
 * version match, no edits after sign-off.
 */
export function createConsultationNotesFixtureApi({
  env = process.env,
  actor = NO_ACTOR,
  world = sharedClinicalWorld(),
  store = sharedStore(),
  now = () => new Date(),
}: { env?: Env; actor?: FixtureActor; world?: ClinicalWorld; store?: Store; now?: () => Date } = {}): ConsultationNotesApi {
  assertFixtureAllowed(env);
  const doctorId = actor.role === "doctor" ? actor.doctorId : null;

  /** Privacy-safe: unknown and other doctors' bookings are indistinguishable (forbidden). */
  const booking = (bookingId: string): FixtureBooking | null => {
    const b = doctorId ? world.bookings.get(bookingId) : undefined;
    return b && b.assignedDoctorId === doctorId ? b : null;
  };

  return {
    getNote: async (bookingId) => {
      const b = booking(bookingId);
      if (!b) return fail("forbidden");
      const n = store.get(bookingId);
      return ok(n ? clone(n) : null);
    },

    saveDraft: async (bookingId, input) => {
      const b = booking(bookingId);
      if (!b) return fail("forbidden");
      if (b.state !== "completed") return fail("conflict");
      const parsed = saveNoteInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const current = store.get(bookingId);
      if (current?.status === "signed_off") return fail("conflict");
      if ((current?.version ?? 0) !== parsed.data.expectedVersion) return fail("conflict");
      const next: ConsultationNote = {
        bookingId,
        status: "draft",
        version: (current?.version ?? 0) + 1,
        sections: parsed.data.sections,
        updatedAt: now().toISOString(),
        signedOffAt: null,
        signedOffBy: null,
      };
      store.set(bookingId, consultationNoteSchema.parse(next));
      return ok(clone(next));
    },

    signOff: async (bookingId, input) => {
      const b = booking(bookingId);
      if (!b) return fail("forbidden");
      if (b.state !== "completed") return fail("conflict");
      const parsed = signOffInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const current = store.get(bookingId);
      if (!current) return fail("not_found");
      if (current.status === "signed_off" || current.version !== parsed.data.expectedVersion) return fail("conflict");
      const missing = missingForSignOff(current.sections);
      if (missing.length > 0) return fail("validation", { fields: Object.fromEntries(missing.map((m) => [`sections.${m}`, "required"])) });
      const at = now().toISOString();
      const doctor = world.doctors.get(doctorId!);
      const next: ConsultationNote = { ...current, status: "signed_off", version: current.version + 1, updatedAt: at, signedOffAt: at, signedOffBy: { displayName: doctor?.displayName ?? "Doctor" } };
      store.set(bookingId, consultationNoteSchema.parse(next));
      return ok(clone(next));
    },
  };
}
