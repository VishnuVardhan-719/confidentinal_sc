import { z } from "zod";
import { pinSchema } from "@/modules/catalog/schemas";
import { baseRequestFields, serviceRequestSchema } from "@/modules/service-requests/core";
import { DESTINATION_KINDS, MOBILITY, VEHICLE_FITS, VEHICLE_TYPES } from "./types";

export const destinationSchema = z.strictObject({
  kind: z.enum(DESTINATION_KINDS),
  name: z.string().trim().min(2).max(80).optional(),
  locality: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  pin: pinSchema,
});

/**
 * What the patient sends for a scheduled transfer. `addressId` is the pickup address. The fare comes from the
 * operator on the server. `notEmergency` must be confirmed: emergencies are never booked here.
 */
export const ambulanceRequestInputSchema = z.strictObject({
  ...baseRequestFields,
  vehicleType: z.enum(VEHICLE_TYPES),
  mobility: z.enum(MOBILITY),
  destination: destinationSchema,
  companion: z.boolean(),
  notEmergency: z.literal(true),
}).refine(input => VEHICLE_FITS[input.mobility].includes(input.vehicleType), { path: ["vehicleType"], message: "vehicle_unfit" });
export type AmbulanceRequestInput = z.infer<typeof ambulanceRequestInputSchema>;

export const ambulanceRequestDetailsSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES), mobility: z.enum(MOBILITY), companion: z.boolean(),
  destination: z.object({ kind: z.enum(DESTINATION_KINDS), name: z.string().optional(), locality: z.string(), city: z.string(), pin: pinSchema }),
});
export const ambulanceRequestSchema = serviceRequestSchema(ambulanceRequestDetailsSchema);
