import { z } from "zod";
import { pinSchema } from "./catalog";

export const versionSchema = z.number().int().positive().max(2_147_483_645);
export const bookingRequestSchema = z.strictObject({ patientId: z.uuid(), serviceId: z.uuid(), addressId: z.uuid(), startAt: z.iso.datetime() });
export const addressSchema = z.strictObject({ patientId: z.uuid(), line1: z.string().trim().min(1).max(240),
  locality: z.string().trim().min(1).max(120), pin: pinSchema, contactName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^\+91[6-9][0-9]{9}$/), expectedVersion: z.number().int().min(0).max(2_147_483_645), addressId: z.uuid().optional() });
export const reasonSchema = z.enum(["patient_request", "provider_unavailable", "unable_to_service", "other"]);
export const decisionSchema = z.strictObject({ expectedVersion: versionSchema, reason: reasonSchema });
export const acceptSchema = z.strictObject({ expectedVersion: versionSchema, resourceIds: z.array(z.uuid()).min(1).max(2)
  .refine(ids => new Set(ids).size === ids.length) });
export const advanceSchema = z.strictObject({ expectedVersion: versionSchema });
export const listBookingsSchema = z.strictObject({ providerId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() });
export const availabilitySchema = z.strictObject({ provider: z.uuid(), service: z.uuid(), date: z.iso.date() });

export const rescheduleSchema = z.strictObject({ expectedVersion: versionSchema, startAt: z.iso.datetime() });
export const resourceSchema = z.strictObject({ providerId: z.uuid(), kind: z.enum(["person", "vehicle"]), personProfileId: z.uuid().optional(),
  vehicleKey: z.string().regex(/^[A-Z0-9]{6,20}$/).optional(), expectedVersion: z.number().int().min(0).max(2_147_483_645),
  resourceId: z.uuid().optional(), status: z.enum(["active", "disabled"]).default("active") });
export const availabilityRuleSchema = z.strictObject({ providerId: z.uuid(), resourceId: z.uuid(), weekday: z.number().int().min(0).max(6),
  localStart: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/), localEnd: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date(), expectedVersion: z.number().int().min(0).max(2_147_483_645), ruleId: z.uuid().optional() });
export const blackoutSchema = z.strictObject({ providerId: z.uuid(), resourceId: z.uuid(), startAt: z.iso.datetime(), endAt: z.iso.datetime(),
  reason: z.enum(["unavailable", "maintenance", "other"]), expectedVersion: versionSchema });

