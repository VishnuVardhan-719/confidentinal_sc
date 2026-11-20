import { z } from "zod";
import { versionSchema } from "./booking";

// Code lists mirror the CHECKs in 20261117001700/001710 (LAB-Q10). No free text anywhere.
export const sampleTypeSchema = z.enum(["venous_blood", "capillary_blood", "urine", "stool", "swab"]);
export const containerCodeSchema = z.enum(["edta", "serum", "fluoride", "citrate", "heparin", "urine_cup", "stool_cup", "swab_tube"]);
export const preparationCodeSchema = z.enum(["none", "fasting", "first_morning_sample"]);
export const collectionFailureSchema = z.enum(["patient_declined", "preparation_not_followed", "sample_not_obtained", "technician_unable"]);
export const handoffFailureSchema = z.enum(["sample_damaged", "sample_lost", "technician_unable", "lab_not_receiving"]);
export const followupCodeSchema = z.enum(["patient_contacted", "new_booking_offered", "escalated_to_platform"]);

export const labTestSchema = z.strictObject({
  sampleType: sampleTypeSchema,
  containerCodes: z.array(containerCodeSchema).min(1).max(6).refine(codes => new Set(codes).size === codes.length),
  fastingHours: z.number().int().min(0).max(16),
  preparationCode: preparationCodeSchema,
  expectedVersion: z.number().int().min(0).max(2_147_483_645),
}).refine(v => (v.fastingHours > 0) === (v.preparationCode === "fasting"));
// startAt must be UTC (z.iso.datetime rejects offsets). Price, state, category and the
// technician are never client inputs.
export const labBookingSchema = z.strictObject({ patientId: z.uuid(), serviceId: z.uuid(), addressId: z.uuid(),
  startAt: z.iso.datetime(), preparationAcknowledged: z.boolean() });
export const labAcceptSchema = z.strictObject({ expectedVersion: versionSchema, resourceId: z.uuid() });
export const labStepSchema = z.strictObject({ expectedVersion: versionSchema });
export const collectionFailedSchema = z.strictObject({ expectedVersion: versionSchema, failureCode: collectionFailureSchema });
export const handoffFailedSchema = z.strictObject({ expectedVersion: versionSchema, failureCode: handoffFailureSchema });
export const labFollowupSchema = z.strictObject({ code: followupCodeSchema });
export const labAvailabilitySchema = z.strictObject({ service: z.uuid(), date: z.iso.date() });
export const labFollowupsSchema = z.strictObject({ providerId: z.uuid(), limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional() });
