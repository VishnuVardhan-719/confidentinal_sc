import { describe, expect, it } from "vitest";
import {
  driverRosterSchema, transportAcceptSchema, transportRequestSchema, transportSlotsSchema, tripInterruptSchema,
  tripStepSchema, vehicleDocumentSchema, vehicleReviewSchema, vehicleSchema,
} from "@/lib/validation/ambulance";

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const request = { patientId: a, serviceId: a, pickupAddressId: a, destinationAddressId: b, requirement: "stretcher", startAt: "2027-01-01T09:00:00Z" };
const FORBIDDEN = ["lat", "lng", "location", "coordinates", "eta", "distance", "category", "price", "amount"];

describe("ambulance validation", () => {
  it("accepts a well-formed request", () => {
    expect(transportRequestSchema.safeParse(request).success).toBe(true);
  });
  it.each(FORBIDDEN)("every trip body refuses %s", key => {
    expect(transportRequestSchema.safeParse({ ...request, [key]: 1 }).success).toBe(false);
    expect(transportAcceptSchema.safeParse({ expectedVersion: 2, driverResourceId: a, vehicleResourceId: b, [key]: 1 }).success).toBe(false);
    expect(tripStepSchema.safeParse({ expectedVersion: 2, [key]: 1 }).success).toBe(false);
    expect(tripInterruptSchema.safeParse({ expectedVersion: 2, reason: "driver_unable", [key]: 1 }).success).toBe(false);
  });
  it("pickup and destination must differ; requirement is an enum; times are ISO", () => {
    expect(transportRequestSchema.safeParse({ ...request, destinationAddressId: a }).success).toBe(false);
    expect(transportRequestSchema.safeParse({ ...request, requirement: "bls" }).success).toBe(false);
    expect(transportRequestSchema.safeParse({ ...request, startAt: "tomorrow" }).success).toBe(false);
    expect(transportRequestSchema.safeParse({ ...request, patientId: "x" }).success).toBe(false);
  });
  it("accept needs two distinct resources and a positive version", () => {
    expect(transportAcceptSchema.safeParse({ expectedVersion: 2, driverResourceId: a, vehicleResourceId: a }).success).toBe(false);
    expect(transportAcceptSchema.safeParse({ expectedVersion: 0, driverResourceId: a, vehicleResourceId: b }).success).toBe(false);
  });
  it("interrupt reasons are the driver list only", () => {
    for (const reason of ["vehicle_breakdown", "unsafe_conditions", "requirement_mismatch", "ended_for_emergency", "driver_unable"])
      expect(tripInterruptSchema.safeParse({ expectedVersion: 3, reason }).success).toBe(true);
    for (const reason of ["ops_closeout", "provider_did_not_attend", "no_show_confirmed", "", undefined])
      expect(tripInterruptSchema.safeParse({ expectedVersion: 3, reason }).success).toBe(false);
  });
  it("slots take the public provider reference, never a UUID", () => {
    expect(transportSlotsSchema.safeParse({ provider: "SCV-AMB-000001", service: a, date: "2027-01-01", requirement: "seated" }).success).toBe(true);
    expect(transportSlotsSchema.safeParse({ provider: a, service: a, date: "2027-01-01", requirement: "seated" }).success).toBe(false);
    expect(transportSlotsSchema.safeParse({ provider: "SCV-AMB-000001", service: a, date: "2027-01-01" }).success).toBe(false);
  });
  it("fleet bodies are strict", () => {
    expect(vehicleSchema.safeParse({ providerId: a, resourceId: b, vehicleType: "basic", supports: ["seated", "seated"], expectedVersion: 0 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ providerId: a, resourceId: b, vehicleType: "als", supports: ["seated"], expectedVersion: 0 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ providerId: a, resourceId: b, vehicleType: "basic", supports: [], expectedVersion: 0 }).success).toBe(false);
    expect(vehicleDocumentSchema.safeParse({ kind: "puc", contentType: "application/pdf", expiresAt: "2027-01-01T00:00:00Z", expectedVersion: 1 }).success).toBe(false);
    expect(vehicleDocumentSchema.safeParse({ kind: "insurance", contentType: "text/plain", expiresAt: "2027-01-01T00:00:00Z", expectedVersion: 1 }).success).toBe(false);
    expect(driverRosterSchema.safeParse({ providerId: a, resourceId: b, status: "paused", expectedVersion: 0 }).success).toBe(false);
    expect(vehicleReviewSchema.safeParse({ decision: "approved", reason: "   ", expectedVersion: 1 }).success).toBe(false);
    expect(vehicleReviewSchema.safeParse({ decision: "approved", reason: "x".repeat(501), expectedVersion: 1 }).success).toBe(false);
  });
});
