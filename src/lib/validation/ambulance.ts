import { z } from "zod";
import { providerReferenceSchema } from "./catalog";
import { versionSchema } from "./booking";

// Strict objects: unknown keys, including lat, lng, location, coordinates, eta, distance,
// category, price and amount, are rejected (design §8). No location is ever accepted.
export const requirementSchema = z.enum(["seated", "wheelchair", "stretcher"]);
export const driverReasonSchema = z.enum(["vehicle_breakdown", "unsafe_conditions", "requirement_mismatch", "ended_for_emergency", "driver_unable"]);
const startVersionSchema = z.number().int().min(0).max(2_147_483_645);
const pageSchema = { limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() };

// provider is the public reference from search; the provider UUID never leaves the server.
export const transportSlotsSchema = z.strictObject({ provider: providerReferenceSchema, service: z.uuid(), date: z.iso.date(), requirement: requirementSchema });
export const transportRequestSchema = z.strictObject({ patientId: z.uuid(), serviceId: z.uuid(), pickupAddressId: z.uuid(),
  destinationAddressId: z.uuid(), requirement: requirementSchema, startAt: z.iso.datetime() })
  .refine(v => v.pickupAddressId !== v.destinationAddressId);
export const transportAcceptSchema = z.strictObject({ expectedVersion: versionSchema, driverResourceId: z.uuid(), vehicleResourceId: z.uuid() })
  .refine(v => v.driverResourceId !== v.vehicleResourceId);
export const tripStepSchema = z.strictObject({ expectedVersion: versionSchema });
export const tripInterruptSchema = z.strictObject({ expectedVersion: versionSchema, reason: driverReasonSchema });
export const tripQueueSchema = z.strictObject({ providerId: z.uuid(), ...pageSchema });
export const driverTripsSchema = z.strictObject({ ...pageSchema });
export const fleetQuerySchema = z.strictObject({ providerId: z.uuid() });
export const vehicleSchema = z.strictObject({ providerId: z.uuid(), resourceId: z.uuid(), vehicleType: z.enum(["basic", "patient_transfer"]),
  supports: z.array(requirementSchema).min(1).max(3).refine(s => new Set(s).size === s.length), expectedVersion: startVersionSchema });
export const vehicleDocumentSchema = z.strictObject({ kind: z.enum(["registration_certificate", "fitness_certificate", "permit", "insurance"]),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]), expiresAt: z.iso.datetime(), expectedVersion: versionSchema });
export const vehicleSubmitSchema = z.strictObject({ expectedVersion: versionSchema });
export const driverRosterSchema = z.strictObject({ providerId: z.uuid(), resourceId: z.uuid(), status: z.enum(["active", "disabled"]), expectedVersion: startVersionSchema });
export const readTicketSchema = z.strictObject({ purpose: z.enum(["owner_view", "admin_review"]) });
export const vehicleReviewSchema = z.strictObject({ decision: z.enum(["approved", "rejected", "suspended"]),
  reason: z.string().trim().min(1).max(500), expectedVersion: versionSchema });

// Shape the database answers for advance_trip (20261117001820).
export const advanceResultSchema = z.object({ version: z.number().int().positive(), substate: z.string(), blocked: z.string().nullable() });
