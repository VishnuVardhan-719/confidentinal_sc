import { fail, ok, type ApiResult } from "@/lib/api/result";
import {
  DEFAULT_DOCTOR_ACTOR,
  fixtureHash,
  sharedClinicalWorld,
  type ClinicalWorld,
  type FixtureActor,
  type FixtureBooking,
  type FixtureChallenge,
} from "@/fixtures/clinical/world";
import { emptyDraftContent } from "@/modules/clinical/schemas";
import type { DoctorApi } from "./api";
import {
  acceptInputSchema,
  advanceInputSchema,
  otpCodeSchema,
  type ArrivalChallenge,
  type AssignedVisitView,
  type DoctorRequestView,
  type VersionResponse,
} from "./types";

export type DoctorFixtureOptions = {
  world?: ClinicalWorld;
  actor?: FixtureActor;
  now?: () => Date;
  /** Delivers a fresh code to the (simulated) patient. Default: random six digits. */
  generateCode?: () => string;
  /** Receives the code as the patient would see it. Tests use this; production never runs fixtures. */
  deliverToPatient?: (bookingId: string, code: string) => void;
  /** Proposed policy values (not approved): 5 minute validity, 5 attempts, 3 resends, 30 s cooldown. */
  policy?: { validityMinutes: number; maxAttempts: number; maxResends: number; resendCooldownSeconds: number };
};

const DEFAULT_POLICY = { validityMinutes: 5, maxAttempts: 5, maxResends: 3, resendCooldownSeconds: 30 };

function randomCode(): string {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

const toRequestView = (b: FixtureBooking): DoctorRequestView => ({
  kind: "request",
  bookingId: b.bookingId,
  publicReference: b.publicReference,
  state: b.state,
  serviceName: b.serviceName,
  scheduledStartAt: b.scheduledStartAt,
  area: { ...b.area },
  quotedAmountPaise: b.amountPaise,
  respondBy: b.respondBy,
  version: b.version,
});

const toVisitView = (b: FixtureBooking): AssignedVisitView => ({
  kind: "assigned",
  bookingId: b.bookingId,
  publicReference: b.publicReference ?? "",
  state: b.state,
  phase: b.phase,
  serviceName: b.serviceName,
  scheduledStartAt: b.scheduledStartAt,
  patient: { ...b.patient },
  contactPhone: b.contactPhone,
  address: { ...b.address },
  amountPaise: b.amountPaise,
  paymentState: b.paymentState,
  hasKnownAllergies: b.hasKnownAllergies,
  consultationId: b.consultationId,
  version: b.version,
});

const toChallengeView = (c: FixtureChallenge): ArrivalChallenge => ({
  bookingId: c.bookingId,
  challengeId: c.challengeId,
  status: c.status,
  issuedAt: c.issuedAt,
  expiresAt: c.expiresAt,
  attemptsRemaining: c.attemptsRemaining,
  maxAttempts: c.maxAttempts,
  resendsRemaining: c.resendsRemaining,
  resendAvailableAt: c.resendAvailableAt,
});

/**
 * Synthetic fixture adapter that simulates server-side authorization and state rules so the UI
 * can exercise denial/expiry/conflict paths. It is NOT a security boundary.
 */
export function createDoctorFixtureApi(options: DoctorFixtureOptions = {}): DoctorApi {
  const world = options.world ?? sharedClinicalWorld();
  const actor = options.actor ?? DEFAULT_DOCTOR_ACTOR;
  const now = options.now ?? (() => new Date());
  const generateCode = options.generateCode ?? randomCode;
  const deliver = options.deliverToPatient ?? (() => undefined);
  const policy = options.policy ?? DEFAULT_POLICY;

  const doctorId = actor.role === "doctor" ? actor.doctorId : null;

  /** Privacy-safe: unknown and not-assigned look the same to the caller. */
  const assigned = (bookingId: string): FixtureBooking | null => {
    const b = world.bookings.get(bookingId);
    return b && doctorId && b.assignedDoctorId === doctorId ? b : null;
  };

  const advance = (bookingId: string, raw: unknown, from: FixtureBooking["phase"], to: FixtureBooking["phase"]): ApiResult<VersionResponse> => {
    const parsed = advanceInputSchema.safeParse(raw);
    if (!parsed.success) return fail("validation");
    const b = assigned(bookingId);
    if (!b) return fail("forbidden");
    if (parsed.data.expectedVersion !== b.version) return fail("conflict");
    if (b.state !== "confirmed" || b.phase !== from) return fail("conflict");
    b.phase = to;
    b.version += 1;
    return ok({ version: b.version });
  };

  const issueChallenge = (b: FixtureBooking, resendsRemaining: number): FixtureChallenge => {
    const t = now();
    const code = generateCode();
    const salt = `${b.bookingId}:${t.getTime()}:${world.challenges.size}`;
    const ch: FixtureChallenge = {
      challengeId: `syn-ch-${world.challenges.size + 1}`,
      bookingId: b.bookingId,
      doctorId: b.assignedDoctorId ?? "",
      salt,
      codeHash: fixtureHash(salt, code),
      status: "active",
      issuedAt: t.toISOString(),
      expiresAt: new Date(t.getTime() + policy.validityMinutes * 60_000).toISOString(),
      attemptsRemaining: policy.maxAttempts,
      maxAttempts: policy.maxAttempts,
      resendsRemaining,
      resendAvailableAt: resendsRemaining > 0 ? new Date(t.getTime() + policy.resendCooldownSeconds * 1000).toISOString() : null,
    };
    // Supersede any previous challenge for this booking.
    for (const prev of world.challenges.values()) {
      if (prev.bookingId === b.bookingId && prev.status === "active") prev.status = "superseded";
    }
    world.challenges.set(ch.challengeId, ch);
    deliver(b.bookingId, code);
    return ch;
  };

  const currentChallenge = (bookingId: string): FixtureChallenge | null => {
    let latest: FixtureChallenge | null = null;
    for (const c of world.challenges.values()) if (c.bookingId === bookingId) latest = c;
    return latest;
  };

  const refreshExpiry = (c: FixtureChallenge) => {
    if (c.status === "active" && Date.parse(c.expiresAt) <= now().getTime()) c.status = "expired";
  };

  return {
    listRequests: async () => {
      if (!doctorId) return fail("forbidden");
      const items = [...world.bookings.values()].filter((b) => b.state === "requested" && b.requestedDoctorId === doctorId).map(toRequestView);
      return ok(items);
    },
    listVisits: async () => {
      if (!doctorId) return fail("forbidden");
      return ok([...world.bookings.values()].filter((b) => b.assignedDoctorId === doctorId && b.state !== "requested").map(toVisitView));
    },
    getVisit: async (bookingId) => {
      const b = assigned(bookingId);
      return b ? ok(toVisitView(b)) : fail("forbidden");
    },
    accept: async (bookingId, raw) => {
      const parsed = acceptInputSchema.safeParse(raw);
      if (!parsed.success) return fail("validation");
      const b = world.bookings.get(bookingId);
      if (!b || !doctorId || b.requestedDoctorId !== doctorId) return fail("forbidden");
      if (b.state !== "requested" || parsed.data.expectedVersion !== b.version) return fail("conflict");
      b.state = "confirmed";
      b.assignedDoctorId = doctorId;
      b.publicReference ??= `SYN-BKG-${b.bookingId.slice(-4)}`;
      b.version += 1;
      return ok({ version: b.version });
    },
    enRoute: async (bookingId, input) => advance(bookingId, input, "scheduled", "en_route"),
    arrive: async (bookingId, input) => {
      const r = advance(bookingId, input, "en_route", "arrived");
      if (r.ok) {
        const b = world.bookings.get(bookingId);
        if (b) issueChallenge(b, policy.maxResends);
      }
      return r;
    },
    getArrivalChallenge: async (bookingId) => {
      const b = assigned(bookingId);
      if (!b) return fail("forbidden");
      const c = currentChallenge(bookingId);
      if (!c) return fail("not_found");
      refreshExpiry(c);
      return ok(toChallengeView(c));
    },
    resendArrivalCode: async (bookingId) => {
      const b = assigned(bookingId);
      if (!b) return fail("forbidden");
      const c = currentChallenge(bookingId);
      if (!c || b.phase !== "arrived") return fail("conflict");
      if (c.status === "verified") return fail("conflict");
      if (c.resendsRemaining <= 0) return fail("rate_limited");
      if (c.resendAvailableAt && Date.parse(c.resendAvailableAt) > now().getTime()) {
        return fail("rate_limited", { retryAfterSeconds: Math.ceil((Date.parse(c.resendAvailableAt) - now().getTime()) / 1000) });
      }
      return ok(toChallengeView(issueChallenge(b, c.resendsRemaining - 1)));
    },
    verifyArrival: async (bookingId, input) => {
      if (!otpCodeSchema.safeParse(input.code).success) return fail("validation", { fields: { code: "otp_format" } });
      const b = assigned(bookingId);
      // Wrong doctor: denied without revealing whether a challenge exists.
      if (!b) return fail("forbidden");
      const c = world.challenges.get(input.challengeId);
      if (!c || c.bookingId !== bookingId || c.doctorId !== doctorId) return fail("forbidden");
      refreshExpiry(c);
      const view = () => toChallengeView(c);
      if (c.status === "verified" || c.status === "superseded") return ok({ result: "rejected", reason: "replayed", challenge: view() });
      if (c.status === "expired") return ok({ result: "rejected", reason: "expired", challenge: view() });
      if (c.status === "locked" || c.attemptsRemaining <= 0) {
        c.status = "locked";
        return ok({ result: "rejected", reason: "attempts_exhausted", challenge: view() });
      }
      if (fixtureHash(c.salt, input.code) !== c.codeHash) {
        c.attemptsRemaining -= 1;
        if (c.attemptsRemaining === 0) {
          c.status = "locked";
          return ok({ result: "rejected", reason: "attempts_exhausted", challenge: view() });
        }
        return ok({ result: "rejected", reason: "invalid_code", challenge: view() });
      }
      c.status = "verified";
      b.phase = "arrival_verified";
      b.version += 1;
      return ok({ result: "verified", bookingVersion: b.version, verifiedAt: now().toISOString() });
    },
    startConsultation: async (bookingId, raw) => {
      const parsed = advanceInputSchema.safeParse(raw);
      if (!parsed.success) return fail("validation");
      const b = assigned(bookingId);
      if (!b) return fail("forbidden");
      if (parsed.data.expectedVersion !== b.version || b.phase !== "arrival_verified") return fail("conflict");
      b.state = "in_progress";
      b.phase = "service_started";
      b.version += 1;
      if (!b.consultationId) {
        const consultationId = `syn-c-${b.bookingId.slice(-4)}`;
        world.consultations.set(consultationId, {
          consultationId,
          bookingId: b.bookingId,
          patientId: b.patientId,
          doctorId: b.assignedDoctorId ?? "",
          status: "draft",
          draftVersion: 0,
          savedAt: null,
          content: emptyDraftContent(),
          signed: null,
        });
        b.consultationId = consultationId;
      }
      return ok({ version: b.version });
    },
  };
}
