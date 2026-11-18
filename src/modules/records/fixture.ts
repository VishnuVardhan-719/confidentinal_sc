import { fail, ok } from "@/lib/api/result";
import {
  clone,
  deepFreeze,
  assertFixtureAllowed,
  NO_ACTOR,
  sharedClinicalWorld,
  type ClinicalWorld,
  type FixtureActor,
  type FixtureBooking,
  type FixtureHealthFact,
} from "@/fixtures/clinical/world";
import { latestSigned } from "@/modules/clinical/types";
import { istDate } from "@/modules/doctor/visit";
import type { RecordsApi } from "./api";
import { proofState } from "./logic";
import {
  collectionInputSchema,
  confirmFactsInputSchema,
  correctFactInputSchema,
  photoConsentInputSchema,
  photoUploadInputSchema,
  proofTokenSchema,
  type CollectionView,
  type HealthFactView,
  type PhotoMeta,
  type ProofOfVisit,
} from "./types";

export type RecordsFixtureOptions = {
  /** Env checked for APP_ENV=production (the real process env is always checked too). */
  env?: Record<string, string | undefined>;
  world?: ClinicalWorld;
  actor?: FixtureActor;
  now?: () => Date;
  /** Proposed lifetimes (not approved). */
  proofValidityMinutes?: number;
  linkSeconds?: number;
};

const hexToken = (bytes: number) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Synthetic records fixture (DC09-DC14). Simulates server authorization: own-patient-only
 * records, assigned-doctor-only facts/collection/photos, consent before upload. Not a security boundary.
 */
export function createRecordsFixtureApi(options: RecordsFixtureOptions = {}): RecordsApi {
  assertFixtureAllowed(options.env);
  const world = options.world ?? sharedClinicalWorld();
  // Deny-by-default: callers pass the actor derived from the fixture session.
  const actor = options.actor ?? NO_ACTOR;
  const now = options.now ?? (() => new Date());
  const proofMinutes = options.proofValidityMinutes ?? 24 * 60;
  const linkSeconds = options.linkSeconds ?? 300;
  const patientId = actor.role === "patient" ? actor.patientId : null;
  const doctorId = actor.role === "doctor" ? actor.doctorId : null;
  const collectionKeys = new Map<string, string>();
  const proofKeys = new Map<string, string>();

  const assignedBooking = (bookingId: string): FixtureBooking | null => {
    const b = world.bookings.get(bookingId);
    return b && doctorId && b.assignedDoctorId === doctorId ? b : null;
  };
  const assignedConsultation = (consultationId: string) => {
    const c = world.consultations.get(consultationId);
    return c && assignedBooking(c.bookingId) ? c : null;
  };
  /** Patient's own FINAL record; drafts and other patients' records are indistinguishable from missing. */
  const ownFinal = (consultationId: string) => {
    const c = world.consultations.get(consultationId);
    if (!c || !patientId || c.patientId !== patientId) return { denied: true as const };
    if (c.status !== "final" || !c.signed) return { missing: true as const };
    return { record: c.signed };
  };

  const factView = (f: FixtureHealthFact): HealthFactView => {
    const versions = clone(f.versions).sort((a, b) => b.version - a.version);
    return { factId: f.factId, kind: f.kind, current: versions[0], history: versions.slice(1) };
  };

  const collectionView = (b: FixtureBooking): CollectionView => {
    const rec = world.collections.get(b.bookingId);
    const doctor = world.doctors.get(rec?.recordedBy ?? "");
    return {
      bookingId: b.bookingId,
      status: rec ? "recorded" : "not_recorded",
      record: rec ? { bookingId: rec.bookingId, method: rec.method, amountPaise: rec.amountPaise, reference: rec.reference, collectedAt: rec.collectedAt, recordedByDisplayName: doctor?.displayName ?? "" } : null,
      // Recording a provider collection never changes the gateway payment state here.
      paymentState: b.paymentState,
      amountDuePaise: b.amountPaise,
    };
  };

  const photoView = (p: { photoId: string; consultationId: string; contentType: PhotoMeta["contentType"]; sizeBytes: number; uploadedAt: string; scanStatus: PhotoMeta["scanStatus"]; withdrawnAt: string | null }): PhotoMeta => ({
    photoId: p.photoId,
    consultationId: p.consultationId,
    contentType: p.contentType,
    sizeBytes: p.sizeBytes,
    uploadedAt: p.uploadedAt,
    scanStatus: p.scanStatus,
    withdrawn: p.withdrawnAt !== null,
  });

  const link = (kind: string) => ({ url: `https://fixture.invalid/${kind}/${hexToken(12)}`, expiresAt: new Date(now().getTime() + linkSeconds * 1000).toISOString() });

  return {
    listMyRecords: async () => {
      if (!patientId) return fail("forbidden");
      const items = [...world.consultations.values()]
        .filter((c) => c.patientId === patientId && c.status === "final" && c.signed)
        .map((c) => {
          const s = c.signed!;
          const first = s.versions[0];
          const b = world.bookings.get(c.bookingId);
          return {
            consultationId: c.consultationId,
            bookingReference: s.bookingReference,
            visitAt: b?.scheduledStartAt ?? first.signedAt,
            doctorDisplayName: first.signedBy.displayName,
            currentVersion: s.currentVersion,
            lastSignedAt: latestSigned(s).signedAt,
            amended: s.amendments.length > 0,
          };
        });
      return ok(items);
    },

    getMyRecord: async (id) => {
      const r = ownFinal(id);
      if ("denied" in r) return fail("forbidden");
      if ("missing" in r) return fail("not_found");
      return ok(deepFreeze(clone(r.record)));
    },

    requestMyRecordPdfLink: async (id) => {
      const r = ownFinal(id);
      if ("denied" in r) return fail("forbidden");
      if ("missing" in r) return fail("not_found");
      const l = link("pdf");
      return ok({ consultationId: id, version: r.record.currentVersion, url: l.url, expiresAt: l.expiresAt });
    },

    getCollection: async (bookingId) => {
      const b = assignedBooking(bookingId);
      return b ? ok(collectionView(b)) : fail("forbidden");
    },

    recordCollection: async (bookingId, input, key) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      if (collectionKeys.get(key) === bookingId) return ok(collectionView(b)); // idempotent retry
      const parsed = collectionInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      if (b.state !== "in_progress" && b.state !== "completed") return fail("conflict");
      if (world.collections.has(bookingId)) return fail("conflict");
      world.collections.set(bookingId, {
        bookingId,
        method: parsed.data.method,
        amountPaise: parsed.data.amountPaise,
        reference: parsed.data.reference || null,
        collectedAt: now().toISOString(),
        recordedBy: doctorId ?? "",
      });
      collectionKeys.set(key, bookingId);
      return ok(collectionView(b));
    },

    listHealthFacts: async (bookingId) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      return ok([...world.facts.values()].filter((f) => f.patientId === b.patientId).map(factView));
    },

    confirmHealthFacts: async (bookingId, input) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      if (b.state !== "in_progress") return fail("conflict");
      const parsed = confirmFactsInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const targets = parsed.data.facts.map((t) => ({ t, f: world.facts.get(t.factId) }));
      if (targets.some(({ f }) => !f || f.patientId !== b.patientId)) return fail("forbidden");
      if (targets.some(({ t, f }) => Math.max(...f!.versions.map((v) => v.version)) !== t.expectedVersion)) return fail("conflict");
      const doctor = world.doctors.get(doctorId ?? "");
      const at = now().toISOString();
      for (const { f } of targets) {
        const latest = f!.versions.reduce((a, v) => (v.version > a.version ? v : a));
        // Previous versions are kept; verification appends a new attributed version.
        f!.versions.push({ version: latest.version + 1, value: latest.value, source: "doctor_verified", recordedAt: at, verifier: { clinicianId: doctorId ?? "", displayName: doctor?.displayName ?? "" }, evidenceNote: parsed.data.evidenceNote });
      }
      return ok(targets.map(({ f }) => factView(f!)));
    },

    correctHealthFact: async (bookingId, input) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      if (b.state !== "in_progress") return fail("conflict");
      const parsed = correctFactInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const f = world.facts.get(parsed.data.factId);
      if (!f || f.patientId !== b.patientId) return fail("forbidden");
      const latest = f.versions.reduce((a, v) => (v.version > a.version ? v : a));
      if (latest.version !== parsed.data.expectedVersion) return fail("conflict");
      const doctor = world.doctors.get(doctorId ?? "");
      f.versions.push({
        version: latest.version + 1,
        value: parsed.data.newValue,
        source: "doctor_verified",
        recordedAt: now().toISOString(),
        verifier: { clinicianId: doctorId ?? "", displayName: doctor?.displayName ?? "" },
        evidenceNote: parsed.data.evidenceNote,
        correctionReason: parsed.data.reason,
      });
      return ok(factView(f));
    },

    issueProof: async (bookingId, key) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      const prior = proofKeys.get(key);
      if (prior) {
        const p = world.proofs.get(prior);
        if (p && p.bookingId === bookingId) return ok({ ...p });
      }
      const attended = b.phase === "arrival_verified" || b.phase === "service_started" || b.phase === "service_completed";
      if (!attended) return fail("conflict");
      const t = now();
      // Revoke any still-active proof for this booking (regeneration).
      for (const p of world.proofs.values()) if (p.bookingId === bookingId && !p.revokedAt) p.revokedAt = t.toISOString();
      const proof: ProofOfVisit = { token: hexToken(16), bookingId, issuedAt: t.toISOString(), expiresAt: new Date(t.getTime() + proofMinutes * 60_000).toISOString(), revokedAt: null };
      world.proofs.set(proof.token, proof);
      proofKeys.set(key, proof.token);
      return ok({ ...proof });
    },

    revokeProof: async (bookingId, token) => {
      const b = assignedBooking(bookingId);
      if (!b) return fail("forbidden");
      const p = world.proofs.get(token);
      if (!p || p.bookingId !== bookingId) return fail("not_found");
      p.revokedAt ??= now().toISOString();
      return ok({ ...p });
    },

    verifyProof: async (token) => {
      // Public: no auth required, minimal data, identical shape for unknown/malformed tokens.
      if (!proofTokenSchema.safeParse(token).success) return ok({ status: "not_found" });
      const p = world.proofs.get(token);
      if (!p) return ok({ status: "not_found" });
      const state = proofState(p, now());
      if (state !== "active") return ok({ status: state });
      const b = world.bookings.get(p.bookingId);
      const doctor = world.doctors.get(b?.assignedDoctorId ?? "");
      if (!b || !doctor) return ok({ status: "not_found" });
      return ok({ status: "valid", serviceDate: istDate(new Date(b.scheduledStartAt)), serviceCategory: "doctor_visit", providerDisplayName: doctor.displayName });
    },

    getPhotoConsent: async (id) => {
      const c = assignedConsultation(id);
      if (!c) return fail("forbidden");
      const consent = world.photoConsents.get(id);
      return ok(consent ? { ...consent } : null);
    },

    recordPhotoConsent: async (id, input) => {
      const c = assignedConsultation(id);
      if (!c) return fail("forbidden");
      const parsed = photoConsentInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const prev = world.photoConsents.get(id);
      if (parsed.data.decision === "withdrawn" && prev?.decision !== "consent") return fail("conflict");
      const at = now().toISOString();
      const consent = { consultationId: id, decision: parsed.data.decision, purpose: parsed.data.decision === "consent" ? parsed.data.purpose : prev?.purpose ?? null, decidedAt: at };
      world.photoConsents.set(id, consent);
      if (parsed.data.decision === "withdrawn") {
        for (const p of world.photos.values()) if (p.consultationId === id) p.withdrawnAt ??= at;
      }
      return ok({ ...consent });
    },

    registerPhotoUpload: async (id, input) => {
      const c = assignedConsultation(id);
      if (!c) return fail("forbidden");
      if (world.photoConsents.get(id)?.decision !== "consent") return fail("forbidden");
      const parsed = photoUploadInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const photo = { photoId: `syn-photo-${world.photos.size + 1}`, consultationId: id, contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes, uploadedAt: now().toISOString(), scanStatus: "pending" as const, withdrawnAt: null };
      world.photos.set(photo.photoId, photo);
      return ok(photoView(photo));
    },

    listPhotos: async (id) => {
      const c = assignedConsultation(id);
      if (!c) return fail("forbidden");
      return ok([...world.photos.values()].filter((p) => p.consultationId === id).map(photoView));
    },

    requestPhotoViewLink: async (photoId) => {
      const p = world.photos.get(photoId);
      // Unknown and unauthorized look the same.
      if (!p || !assignedConsultation(p.consultationId)) return fail("forbidden");
      if (p.withdrawnAt || p.scanStatus !== "clean") return fail("forbidden");
      return ok(link("photo"));
    },
  };
}
