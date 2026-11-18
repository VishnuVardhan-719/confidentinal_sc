import { z } from "zod";
import { categorySchema, paiseSchema, pinSchema, utcSchema, versionSchema, wirePaiseSchema } from "@/modules/catalog/schemas";

export const bookingStatusSchema = z.enum(["DRAFT", "REQUESTED", "ACCEPTED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "DECLINED", "EXPIRED", "CANCELLED", "INTERRUPTED", "NO_SHOW"]);
export const doctorStatusSchema = z.enum(["EN_ROUTE", "ARRIVED", "ARRIVAL_VERIFIED", "IN_CONSULTATION"]);
export const clinicalStatusSchema = z.enum(["NOT_STARTED", "DRAFT", "FINALIZED", "AMENDED"]);
export const doctorOperationalStatusSchema = z.enum(["SCHEDULED", "EN_ROUTE", "ARRIVED", "SERVICE_STARTED", "SERVICE_COMPLETED"]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type DoctorStatus = z.infer<typeof doctorStatusSchema>;
export type ClinicalStatus = z.infer<typeof clinicalStatusSchema>;

export const priceSnapshotSchema = z.object({ amountPaise: paiseSchema, currency: z.literal("INR"), termsVersion: z.string().min(1), policyVersionId: z.uuid() });
export const policySchema = z.object({ id: z.uuid(), version: z.string().min(1), approved: z.literal(true), cancellationText: z.string().min(1), validUntil: utcSchema });
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;
export type BookingPolicy = z.infer<typeof policySchema>;
export const bookingSchema = z.object({
  id: z.uuid(), publicReference: z.string().nullable(), providerId: z.uuid(), serviceId: z.uuid(), category: categorySchema,
  pin: pinSchema, startAt: utcSchema, endAt: utcSchema, status: bookingStatusSchema,
  version: versionSchema, priceSnapshot: priceSnapshotSchema,
  doctorOperationalStatus: doctorOperationalStatusSchema.nullable(), synthetic: z.boolean(),
});
export type Booking = z.infer<typeof bookingSchema>;
export const createBookingSchema = z.strictObject({ patientId: z.uuid(), serviceId: z.uuid(), addressId: z.uuid(), startAt: z.iso.datetime() });
export type CreateBooking = z.infer<typeof createBookingSchema>;
export const decisionReasonSchema = z.enum(["patient_request", "provider_unavailable", "unable_to_service", "other"]);
export const decisionSchema = z.strictObject({ expectedVersion: versionSchema, reason: decisionReasonSchema });
export const acceptSchema = z.strictObject({ expectedVersion: versionSchema, resourceIds: z.array(z.uuid()).min(1).max(2).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length) });
export const bookingListSchema = z.strictObject({ providerId: z.uuid().optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() });
export type BookingList = z.input<typeof bookingListSchema>;
export type BookingDecision = z.infer<typeof decisionSchema>;
export type BookingAccept = z.infer<typeof acceptSchema>;
export const bookingEventSchema = z.object({ id: z.uuid(), bookingId: z.uuid(), status: bookingStatusSchema, version: versionSchema,
  occurredAt: utcSchema, actorRole: z.enum(["patient", "provider", "assigned", "system"]), synthetic: z.boolean() });
export type BookingEvent = z.infer<typeof bookingEventSchema>;

const statusWire = z.enum(["draft", "requested", "accepted", "confirmed", "in_progress", "completed", "declined", "expired", "cancelled", "interrupted", "no_show"])
  .transform(value => bookingStatusSchema.parse(value.toUpperCase()));
const operationalWire = z.enum(["scheduled", "en_route", "arrived", "service_started", "service_completed"])
  .transform(value => doctorOperationalStatusSchema.parse(value.toUpperCase()));
/** Deliberately strips authorized address/contact snapshots: this is a minimal view model. */
export const bookingWireSchema = z.object({
  id: z.uuid(), public_ref: z.string().nullable(), provider_id: z.uuid(), service_id: z.uuid(), category: categorySchema,
  pin_code: pinSchema, start_at: utcSchema, end_at: utcSchema, state: statusWire, version: versionSchema,
  amount_paise: wirePaiseSchema, currency: z.literal("INR"), terms_version: z.string().min(1), policy_version_id: z.uuid(),
  substate: operationalWire.nullable().optional(),
}).transform(row => bookingSchema.parse({ id: row.id, publicReference: row.public_ref, providerId: row.provider_id, serviceId: row.service_id,
  category: row.category, pin: row.pin_code, startAt: row.start_at, endAt: row.end_at, status: row.state, version: row.version,
  priceSnapshot: { amountPaise: row.amount_paise, currency: row.currency, termsVersion: row.terms_version, policyVersionId: row.policy_version_id },
  doctorOperationalStatus: row.substate ?? null, synthetic: false }));
