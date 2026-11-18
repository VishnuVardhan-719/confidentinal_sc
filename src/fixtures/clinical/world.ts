import { emptyDraftContent, type ClinicalDraftContent } from "@/modules/clinical/schemas";
import type { SignedConsultation } from "@/modules/clinical/types";
import type { BookingState, ChallengeStatus, PaymentStateRef, VisitPhase } from "@/modules/doctor/types";

/**
 * SYNTHETIC fixture world for the doctor / clinical / records modules.
 * Every person, ID, reference and value here is fictional. Never use real patient data.
 * Fixture adapters are refused when APP_ENV=production (src/lib/api/mode.ts).
 */
export const SYNTHETIC = true as const;

export const FIXTURE_IDS = {
  doctorAssigned: "00000000-0000-4000-8000-0000000000d1",
  doctorOther: "00000000-0000-4000-8000-0000000000d2",
  patientA: "00000000-0000-4000-8000-0000000000a1",
  patientB: "00000000-0000-4000-8000-0000000000b1",
  resourceDoctor: "00000000-0000-4000-8000-0000000000e1",
  bookingRequest: "00000000-0000-4000-8000-000000000101",
  bookingToday: "00000000-0000-4000-8000-000000000102",
  bookingUpcoming: "00000000-0000-4000-8000-000000000103",
  bookingPast: "00000000-0000-4000-8000-000000000104",
  bookingPatientB: "00000000-0000-4000-8000-000000000105",
  bookingActive: "00000000-0000-4000-8000-000000000106",
  consultationActive: "00000000-0000-4000-8000-000000000201",
  consultationPastFinal: "00000000-0000-4000-8000-000000000202",
  consultationPatientB: "00000000-0000-4000-8000-000000000203",
} as const;

export type FixtureBooking = {
  bookingId: string;
  publicReference: string | null;
  requestedDoctorId: string;
  assignedDoctorId: string | null;
  patientId: string;
  state: BookingState;
  phase: VisitPhase;
  serviceName: string;
  scheduledStartAt: string;
  respondBy: string | null;
  area: { locality: string; pin: string };
  address: { line1: string; locality: string; pin: string };
  contactPhone: string | null;
  patient: { displayName: string; ageYears: number | null };
  amountPaise: number;
  paymentState: PaymentStateRef;
  hasKnownAllergies: boolean | null;
  consultationId: string | null;
  version: number;
};

export type FixtureChallenge = {
  challengeId: string;
  bookingId: string;
  doctorId: string;
  /** Salted non-cryptographic hash: the fixture "server" never keeps the plaintext code. */
  salt: string;
  codeHash: string;
  status: ChallengeStatus;
  issuedAt: string;
  expiresAt: string;
  attemptsRemaining: number;
  maxAttempts: number;
  resendsRemaining: number;
  resendAvailableAt: string | null;
};

export type FixtureConsultation = {
  consultationId: string;
  bookingId: string;
  patientId: string;
  doctorId: string;
  status: "draft" | "final";
  draftVersion: number;
  savedAt: string | null;
  content: ClinicalDraftContent;
  signed: SignedConsultation | null;
};

export type FixtureHealthFactKind = "blood_group" | "height" | "weight" | "allergy" | "condition" | "medicine" | "surgery" | "note";

export type FixtureHealthFactVersion = {
  version: number;
  value: string;
  source: "patient_entered" | "doctor_verified";
  recordedAt: string;
  verifier: { clinicianId: string; displayName: string } | null;
  evidenceNote: string | null;
  correctionReason?: string | null;
};

export type FixtureHealthFact = {
  factId: string;
  patientId: string;
  kind: FixtureHealthFactKind;
  versions: FixtureHealthFactVersion[];
};

export type FixtureProof = {
  token: string;
  bookingId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type FixturePhoto = {
  photoId: string;
  consultationId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  uploadedAt: string;
  scanStatus: "pending" | "clean" | "rejected";
  withdrawnAt: string | null;
};

export type FixturePhotoConsent = {
  consultationId: string;
  decision: "consent" | "decline" | "withdrawn";
  purpose: string | null;
  decidedAt: string;
};

export type FixtureCollection = {
  bookingId: string;
  method: "cash" | "upi_direct";
  amountPaise: number;
  reference: string | null;
  collectedAt: string;
  recordedBy: string;
};

export type ClinicalWorld = {
  synthetic: typeof SYNTHETIC;
  bookings: Map<string, FixtureBooking>;
  challenges: Map<string, FixtureChallenge>;
  consultations: Map<string, FixtureConsultation>;
  facts: Map<string, FixtureHealthFact>;
  proofs: Map<string, FixtureProof>;
  photoConsents: Map<string, FixturePhotoConsent>;
  photos: Map<string, FixturePhoto>;
  collections: Map<string, FixtureCollection>;
  doctors: Map<string, { displayName: string; registrationLabel: string | null }>;
};

/** FNV-1a 32-bit. Fixture-only stand-in for the server's salted HMAC. Not for security use. */
export function fixtureHash(salt: string, value: string): string {
  let h = 0x811c9dc5;
  const s = `${salt}:${value}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const iso = (d: Date) => d.toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const signedPastContent = (): ClinicalDraftContent => ({
  vitals: { temperature: { value: 99.1, unit: "F" }, pulseBpm: 84, examinationFindings: "Synthetic finding text." },
  assessment: {
    chiefComplaint: "Synthetic complaint for fixture.",
    assessmentType: "provisional",
    uncertaintyNote: "Synthetic: review if symptoms persist.",
  },
  prescription: { prescription: { mode: "none", note: "Synthetic: no medicine indicated." } },
  care: { advice: "Synthetic advice text.", followUp: { mode: "not_required" } },
});

function signed(consultationId: string, bookingId: string, reference: string, signedAt: Date, doctorId: string, doctorName: string): SignedConsultation {
  return {
    consultationId,
    bookingId,
    bookingReference: reference,
    status: "final",
    currentVersion: 1,
    versions: [{ version: 1, signedAt: iso(signedAt), signedBy: { clinicianId: doctorId, displayName: doctorName, registrationLabel: "SYN-REG-0001" }, content: signedPastContent() }],
    amendments: [],
  };
}

/** Build a fresh, isolated synthetic world. `now` anchors all relative times. */
export function createClinicalWorld(now: Date = new Date()): ClinicalWorld {
  const I = FIXTURE_IDS;
  const doctorName = "Dr. Fixture Asha (synthetic)";
  const area = { locality: "Synthetic Nagar", pin: "500001" };
  const address = { line1: "Flat 0, Fixture Residency (synthetic)", locality: area.locality, pin: area.pin };
  const patientA = { displayName: "Fixture Patient A", ageYears: 41 };
  const patientB = { displayName: "Fixture Patient B", ageYears: 29 };

  const base = (over: Partial<FixtureBooking> & Pick<FixtureBooking, "bookingId">): FixtureBooking => ({
    publicReference: "SYN-BKG-0000",
    requestedDoctorId: I.doctorAssigned,
    assignedDoctorId: I.doctorAssigned,
    patientId: I.patientA,
    state: "confirmed",
    phase: "scheduled",
    serviceName: "Home doctor visit (synthetic)",
    scheduledStartAt: iso(addMinutes(now, 60)),
    respondBy: null,
    area,
    address,
    contactPhone: "+910000000000",
    patient: patientA,
    amountPaise: 80_000,
    paymentState: "DUE",
    hasKnownAllergies: true,
    consultationId: null,
    version: 3,
    ...over,
  });

  const bookings: FixtureBooking[] = [
    base({ bookingId: I.bookingRequest, publicReference: null, assignedDoctorId: null, state: "requested", version: 2, respondBy: iso(addMinutes(now, 25)), scheduledStartAt: iso(addMinutes(now, 24 * 60)) }),
    base({ bookingId: I.bookingToday, publicReference: "SYN-BKG-0102", scheduledStartAt: iso(addMinutes(now, 30)) }),
    base({ bookingId: I.bookingActive, publicReference: "SYN-BKG-0106", state: "in_progress", phase: "service_started", consultationId: I.consultationActive, scheduledStartAt: iso(addMinutes(now, -20)), version: 7 }),
    base({ bookingId: I.bookingUpcoming, publicReference: "SYN-BKG-0103", scheduledStartAt: iso(addMinutes(now, 3 * 24 * 60)), hasKnownAllergies: null }),
    base({ bookingId: I.bookingPast, publicReference: "SYN-BKG-0104", state: "completed", phase: "service_completed", consultationId: I.consultationPastFinal, scheduledStartAt: iso(addMinutes(now, -7 * 24 * 60)), paymentState: "PAID", version: 9 }),
    base({ bookingId: I.bookingPatientB, publicReference: "SYN-BKG-0105", patientId: I.patientB, patient: patientB, state: "completed", phase: "service_completed", consultationId: I.consultationPatientB, scheduledStartAt: iso(addMinutes(now, -2 * 24 * 60)), version: 9 }),
  ];

  const consultations: FixtureConsultation[] = [
    { consultationId: I.consultationActive, bookingId: I.bookingActive, patientId: I.patientA, doctorId: I.doctorAssigned, status: "draft", draftVersion: 1, savedAt: iso(addMinutes(now, -1)), content: emptyDraftContent(), signed: null },
    { consultationId: I.consultationPastFinal, bookingId: I.bookingPast, patientId: I.patientA, doctorId: I.doctorAssigned, status: "final", draftVersion: 4, savedAt: iso(addMinutes(now, -7 * 24 * 60 + 40)), content: signedPastContent(), signed: signed(I.consultationPastFinal, I.bookingPast, "SYN-BKG-0104", addMinutes(now, -7 * 24 * 60 + 45), I.doctorAssigned, doctorName) },
    { consultationId: I.consultationPatientB, bookingId: I.bookingPatientB, patientId: I.patientB, doctorId: I.doctorAssigned, status: "final", draftVersion: 2, savedAt: iso(addMinutes(now, -2 * 24 * 60 + 40)), content: signedPastContent(), signed: signed(I.consultationPatientB, I.bookingPatientB, "SYN-BKG-0105", addMinutes(now, -2 * 24 * 60 + 45), I.doctorAssigned, doctorName) },
  ];

  const factAt = iso(addMinutes(now, -30 * 24 * 60));
  const facts: FixtureHealthFact[] = [
    { factId: "fact-a-blood", patientId: I.patientA, kind: "blood_group", versions: [{ version: 1, value: "Synthetic B+", source: "patient_entered", recordedAt: factAt, verifier: null, evidenceNote: null }] },
    { factId: "fact-a-allergy", patientId: I.patientA, kind: "allergy", versions: [{ version: 1, value: "Synthetic allergy entry", source: "patient_entered", recordedAt: factAt, verifier: null, evidenceNote: null }] },
    { factId: "fact-b-blood", patientId: I.patientB, kind: "blood_group", versions: [{ version: 1, value: "Synthetic O-", source: "patient_entered", recordedAt: factAt, verifier: null, evidenceNote: null }] },
  ];

  const toMap = <T, K extends keyof T>(items: T[], key: K) => new Map(items.map((x) => [x[key] as unknown as string, x]));

  return {
    synthetic: SYNTHETIC,
    bookings: toMap(bookings, "bookingId"),
    challenges: new Map(),
    consultations: toMap(consultations, "consultationId"),
    facts: toMap(facts, "factId"),
    proofs: new Map(),
    photoConsents: new Map(),
    photos: new Map(),
    collections: new Map(),
    doctors: new Map([
      [I.doctorAssigned, { displayName: doctorName, registrationLabel: "SYN-REG-0001" }],
      [I.doctorOther, { displayName: "Dr. Fixture Other (synthetic)", registrationLabel: "SYN-REG-0002" }],
    ]),
  };
}

let shared: ClinicalWorld | null = null;
/** Process-wide world used by the index getters in fixture mode. Tests should create their own. */
export function sharedClinicalWorld(): ClinicalWorld {
  shared ??= createClinicalWorld();
  return shared;
}

/**
 * Fixture actor (who the fixture "server" thinks is signed in). Must be derived from the signed-in
 * fixture session by the caller; `none` (no session / unmapped user) is denied everything.
 */
export type FixtureActor = { role: "doctor"; doctorId: string } | { role: "patient"; patientId: string } | { role: "none" };
export const NO_ACTOR: FixtureActor = { role: "none" };

/**
 * Refuse fixtures in production even when a constructor is imported directly. The real process
 * env is authoritative: an injected env can add the production flag but never remove it.
 */
export function assertFixtureAllowed(env?: Record<string, string | undefined>): void {
  const realEnv = typeof process !== "undefined" ? process.env.APP_ENV : undefined;
  if (realEnv === "production" || env?.APP_ENV === "production") throw new Error("Synthetic fixtures are disabled in production");
}
export const DEFAULT_DOCTOR_ACTOR: FixtureActor = { role: "doctor", doctorId: FIXTURE_IDS.doctorAssigned };
export const DEFAULT_PATIENT_ACTOR: FixtureActor = { role: "patient", patientId: FIXTURE_IDS.patientA };

/** Deep-freeze signed records so fixture consumers cannot mutate a signed version. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** Structured clone so callers never get references into the fixture store. */
export const clone = <T>(v: T): T => structuredClone(v);
