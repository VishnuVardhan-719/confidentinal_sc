import { fail, ok } from "@/lib/api/result";
import {
  clone,
  deepFreeze,
  assertFixtureAllowed,
  NO_ACTOR,
  sharedClinicalWorld,
  type ClinicalWorld,
  type FixtureActor,
  type FixtureConsultation,
} from "@/fixtures/clinical/world";
import type { ClinicalApi } from "./api";
import { amendmentRequestSchema, missingForFinalize, saveDraftRequestSchema, signRequestSchema } from "./schemas";
import { latestSigned, type DraftSnapshot, type SignedConsultation } from "./types";

export type ClinicalFixtureOptions = {
  /** Env checked for APP_ENV=production (the real process env is always checked too). */
  env?: Record<string, string | undefined>;
  world?: ClinicalWorld;
  actor?: FixtureActor;
  now?: () => Date;
  /** PDF link lifetime in seconds (proposed, not approved). */
  pdfLinkSeconds?: number;
};

/**
 * Synthetic clinician-side fixture. Simulates server rules: assigned doctor only, active visit,
 * optimistic version, immutable signed versions, append-only amendments. Payment state is
 * deliberately never consulted (DC10). Not a security boundary.
 */
export function createClinicalFixtureApi(options: ClinicalFixtureOptions = {}): ClinicalApi {
  assertFixtureAllowed(options.env);
  const world = options.world ?? sharedClinicalWorld();
  // Deny-by-default: callers pass the actor derived from the fixture session.
  const actor = options.actor ?? NO_ACTOR;
  const now = options.now ?? (() => new Date());
  const pdfSeconds = options.pdfLinkSeconds ?? 300;
  const doctorId = actor.role === "doctor" ? actor.doctorId : null;
  /** idempotencyKey -> consultationId it signed/amended (simulated server dedupe). */
  const seenKeys = new Map<string, { consultationId: string; result: SignedConsultation }>();

  const authorized = (consultationId: string): FixtureConsultation | null => {
    const c = world.consultations.get(consultationId);
    if (!c || !doctorId || c.doctorId !== doctorId) return null;
    const b = world.bookings.get(c.bookingId);
    return b && b.assignedDoctorId === doctorId ? c : null;
  };

  /** Draft writes only while the visit is in consultation. */
  const writable = (c: FixtureConsultation): boolean => {
    const b = world.bookings.get(c.bookingId);
    return !!b && b.state === "in_progress" && b.phase === "service_started";
  };

  const snapshot = (c: FixtureConsultation): DraftSnapshot => ({
    consultationId: c.consultationId,
    bookingId: c.bookingId,
    status: "draft",
    version: c.draftVersion,
    savedAt: c.savedAt,
    content: clone(c.content),
  });

  const signedView = (s: SignedConsultation): SignedConsultation => deepFreeze(clone(s));

  return {
    getDraft: async (id) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      if (c.status === "final") return fail("conflict");
      return ok(snapshot(c));
    },

    saveDraft: async (id, input) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      const parsed = saveDraftRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      // Signed records are immutable: no draft write path after finalization.
      if (c.status === "final") return fail("conflict");
      if (!writable(c)) return fail("forbidden");
      if (parsed.data.expectedVersion !== c.draftVersion) return fail("conflict");
      c.content = clone(parsed.data.content);
      c.draftVersion += 1;
      c.savedAt = now().toISOString();
      return ok({ version: c.draftVersion, savedAt: c.savedAt });
    },

    finalize: async (id, input, idempotencyKey) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      const prior = seenKeys.get(idempotencyKey);
      if (prior) return prior.consultationId === id ? ok(signedView(prior.result)) : fail("conflict");
      const parsed = signRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      if (c.status === "final") return fail("conflict"); // repeat sign with a new intent is denied
      if (!writable(c)) return fail("forbidden");
      if (parsed.data.expectedVersion !== c.draftVersion) return fail("conflict");
      const missing = missingForFinalize(c.content);
      if (missing.length > 0) return fail("validation", { fields: Object.fromEntries(missing.map((m) => [m, "required"])) });

      const doctor = world.doctors.get(c.doctorId);
      const b = world.bookings.get(c.bookingId);
      const signed: SignedConsultation = {
        consultationId: c.consultationId,
        bookingId: c.bookingId,
        bookingReference: b?.publicReference ?? "",
        status: "final",
        currentVersion: 1,
        versions: [
          {
            version: 1,
            signedAt: now().toISOString(),
            signedBy: { clinicianId: c.doctorId, displayName: doctor?.displayName ?? "", registrationLabel: doctor?.registrationLabel ?? null },
            content: clone(c.content),
          },
        ],
        amendments: [],
      };
      c.status = "final";
      c.signed = deepFreeze(signed);
      seenKeys.set(idempotencyKey, { consultationId: id, result: c.signed });
      return ok(signedView(c.signed));
    },

    amend: async (id, input, idempotencyKey) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      const prior = seenKeys.get(idempotencyKey);
      if (prior) return prior.consultationId === id ? ok(signedView(prior.result)) : fail("conflict");
      if (c.status !== "final" || !c.signed) return fail("conflict");
      const parsed = amendmentRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      if (parsed.data.baseVersion !== c.signed.currentVersion) return fail("conflict");

      const doctor = world.doctors.get(c.doctorId);
      const signer = { clinicianId: c.doctorId, displayName: doctor?.displayName ?? "", registrationLabel: doctor?.registrationLabel ?? null };
      const at = now().toISOString();
      const version = c.signed.currentVersion + 1;
      // Append only: previous versions are copied unchanged (they are frozen).
      const next: SignedConsultation = {
        ...clone(c.signed),
        currentVersion: version,
        versions: [...clone(c.signed.versions), { version, signedAt: at, signedBy: signer, content: clone(parsed.data.content) }],
        amendments: [
          ...clone(c.signed.amendments),
          { version, previousVersion: parsed.data.baseVersion, reason: parsed.data.reason, reasonText: parsed.data.reasonText, amendedAt: at, amendedBy: signer },
        ],
      };
      c.signed = deepFreeze(next);
      seenKeys.set(idempotencyKey, { consultationId: id, result: c.signed });
      return ok(signedView(c.signed));
    },

    getConsultation: async (id) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      return c.status === "final" && c.signed ? ok(signedView(c.signed)) : ok(snapshot(c));
    },

    requestPdfLink: async (id) => {
      const c = authorized(id);
      if (!c) return fail("forbidden");
      // No unofficial PDF from a draft.
      if (c.status !== "final" || !c.signed) return fail("not_found");
      const t = now();
      const token = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, "0")).join("");
      return ok({
        consultationId: id,
        version: latestSigned(c.signed).version,
        url: `https://fixture.invalid/pdf/${token}`,
        expiresAt: new Date(t.getTime() + pdfSeconds * 1000).toISOString(),
      });
    },
  };
}
