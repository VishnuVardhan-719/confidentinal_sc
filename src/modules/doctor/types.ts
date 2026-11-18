import { z } from "zod";

/**
 * Doctor visit view models.
 *
 * Booking state names follow origin/task/B01-booking (lowercase DB enum). The doctor "visit
 * phase" follows B01 `substate` values plus `arrival_verified`, which the spec requires but B01
 * does not yet have (logged in docs/frontend/REQUESTS.md).
 */
export const BOOKING_STATES = [
  "draft",
  "requested",
  "accepted",
  "confirmed",
  "in_progress",
  "completed",
  "declined",
  "expired",
  "cancelled",
  "no_show",
  "interrupted",
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const VISIT_PHASES = ["scheduled", "en_route", "arrived", "arrival_verified", "service_started", "service_completed"] as const;
export type VisitPhase = (typeof VISIT_PHASES)[number];

/** Payment state is a separate badge; canonical map belongs to the payments module. */
export type PaymentStateRef = "NOT_INITIATED" | "DUE" | "PROCESSING" | "PAID" | "PARTIALLY_PAID" | "DISPUTED" | "REFUNDED";

/**
 * Pre-acceptance request: minimal fields only. Deliberately has NO patient name, phone, exact
 * address or health history. The type makes leaking them a compile error.
 */
export type DoctorRequestView = {
  kind: "request";
  bookingId: string;
  /** Server-issued reference if any; never derived client-side. */
  publicReference: string | null;
  state: BookingState;
  serviceName: string;
  scheduledStartAt: string;
  /** Coarse area only (locality + PIN). */
  area: { locality: string; pin: string };
  /** Server price snapshot in integer paise. */
  quotedAmountPaise: number;
  /** Server timestamp; UI countdown derives from this, never a hardcoded window. */
  respondBy: string | null;
  version: number;
};

/** Post-acceptance, assigned-doctor-only view. */
export type AssignedVisitView = {
  kind: "assigned";
  bookingId: string;
  publicReference: string;
  state: BookingState;
  phase: VisitPhase;
  serviceName: string;
  scheduledStartAt: string;
  patient: { displayName: string; ageYears: number | null };
  /** Approved contact only; null if the patient has not shared one. */
  contactPhone: string | null;
  address: { line1: string; locality: string; pin: string };
  amountPaise: number;
  paymentState: PaymentStateRef;
  /** True/false only when the server knows; null means unknown (show "not recorded"). */
  hasKnownAllergies: boolean | null;
  consultationId: string | null;
  version: number;
};

export type DoctorVisitLists = { today: AssignedVisitView[]; upcoming: AssignedVisitView[] };

// ---- Arrival OTP challenge -----------------------------------------------------------------

/** Server-side challenge status. The code itself never appears in any DTO sent to the doctor. */
export const CHALLENGE_STATUSES = ["active", "verified", "expired", "locked", "superseded"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const arrivalChallengeSchema = z.strictObject({
  bookingId: z.string().min(1),
  challengeId: z.string().min(1),
  status: z.enum(CHALLENGE_STATUSES),
  issuedAt: z.iso.datetime({ offset: true }),
  /** Server expiry. Client countdown is advisory; server decides. */
  expiresAt: z.iso.datetime({ offset: true }),
  attemptsRemaining: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  resendsRemaining: z.number().int().nonnegative(),
  /** Earliest server time a resend is allowed, or null if resends are exhausted/not applicable. */
  resendAvailableAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ArrivalChallenge = z.infer<typeof arrivalChallengeSchema>;

/** Domain rejection reasons for a submitted code. Wrong doctor is a transport-level forbidden. */
export const OTP_REJECT_REASONS = ["invalid_code", "expired", "replayed", "attempts_exhausted"] as const;
export type OtpRejectReason = (typeof OTP_REJECT_REASONS)[number];

/** Every OTP-related error the UI must handle, including transport-level ones. */
export const OTP_ERROR_CODES = [...OTP_REJECT_REASONS, "wrong_doctor", "resend_limited", "no_active_challenge"] as const;
export type OtpErrorCode = (typeof OTP_ERROR_CODES)[number];

export type VerifyArrivalOutcome =
  | { result: "verified"; bookingVersion: number; verifiedAt: string }
  | { result: "rejected"; reason: OtpRejectReason; challenge: ArrivalChallenge };

export const verifyArrivalOutcomeSchema = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("verified"), bookingVersion: z.number().int().positive(), verifiedAt: z.iso.datetime({ offset: true }) }),
  z.strictObject({ result: z.literal("rejected"), reason: z.enum(OTP_REJECT_REASONS), challenge: arrivalChallengeSchema }),
]);

/** Transient form input. Never persisted, logged or kept after submit. */
export const otpCodeSchema = z.string().regex(/^[0-9]{6}$/);

// ---- Command inputs (B01 shapes) -------------------------------------------------------------
export const versionSchema = z.number().int().positive();
export const acceptInputSchema = z.strictObject({
  expectedVersion: versionSchema,
  resourceIds: z.array(z.uuid()).min(1).max(2),
});
export type AcceptInput = z.infer<typeof acceptInputSchema>;
export const advanceInputSchema = z.strictObject({ expectedVersion: versionSchema });
export type AdvanceInput = z.infer<typeof advanceInputSchema>;
/** B01 `reasonSchema` values. Label keys in DECLINE_REASON_LABEL_KEYS (status.ts). */
export const DECLINE_REASONS = ["patient_request", "provider_unavailable", "unable_to_service", "other"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
/** Reasons a doctor may choose when declining a request (patient_request is the patient's own cancel reason). */
export const DOCTOR_DECLINE_REASONS = ["provider_unavailable", "unable_to_service", "other"] as const satisfies readonly DeclineReason[];
export const declineInputSchema = z.strictObject({ expectedVersion: versionSchema, reason: z.enum(DECLINE_REASONS) });
export type DeclineInput = z.infer<typeof declineInputSchema>;
/** A bookable resource the doctor can attach on accept (B01 resources, kind=person). */
export type AcceptResource = { resourceId: string; displayName: string };
export const versionResponseSchema = z.strictObject({ version: versionSchema });
export type VersionResponse = z.infer<typeof versionResponseSchema>;
