import { describe, expect, it, vi } from "vitest";
import { acceptSchema, addressSchema, availabilityRuleSchema, availabilitySchema, blackoutSchema, bookingRequestSchema, decisionSchema, listBookingsSchema, resourceSchema } from "@/lib/validation/booking";
import { bookingCommand } from "@/lib/booking/service";

const id = "10000000-0000-4000-8000-000000000001";
const request = { patientId: id, serviceId: id, addressId: id, startAt: "2027-01-01T09:00:00Z" };
describe("booking boundaries", () => {
  it("accepts only patient-controlled references and a UTC instant", () => {
    expect(bookingRequestSchema.parse(request)).toEqual(request);
    for (const field of ["amountPaise", "state", "paid", "role", "providerId", "endAt", "contactSnapshot"]) {
      expect(bookingRequestSchema.safeParse({ ...request, [field]: "forged" }).success).toBe(false);
    }
    expect(bookingRequestSchema.safeParse({ ...request, startAt: "2027-01-01T09:00:00+05:30" }).success).toBe(false);
  });
  it("bounds private address and contact input", () => {
    const address = { patientId: id, line1: "Synthetic address", locality: "Synthetic", pin: "500001", contactName: "Synthetic", phone: "+919999999999", expectedVersion: 0 };
    expect(addressSchema.safeParse(address).success).toBe(true);
    expect(addressSchema.safeParse({ ...address, pin: "5000%1" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...address, line1: "x".repeat(241) }).success).toBe(false);
  });
  it("requires versions, safe reason codes and bounded pages", () => {
    expect(decisionSchema.safeParse({ expectedVersion: 0, reason: "other" }).success).toBe(false);
    expect(decisionSchema.safeParse({ expectedVersion: 1, reason: "clinical notes" }).success).toBe(false);
    expect(listBookingsSchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(listBookingsSchema.safeParse({ cursor: "forged" }).success).toBe(false);
  });
});
describe("booking database boundary", () => {
  it.each([ ["42501", 403], ["40001", 409], ["23P01", 409], ["55000", 409], ["22023", 422], ["P0002", 404], ["unknown", 503] ])("maps %s without upstream detail", async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "private data" } });
    await expect(bookingCommand({ rpc }, "cancel_booking", {})).rejects.toMatchObject({ status });
  });
  it("retries only transactional failures with identical arguments", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { code: "40P01" } }).mockResolvedValueOnce({ data: { id }, error: null });
    const args = { p_request_key: id };
    expect(await bookingCommand({ rpc }, "create_booking_request", args)).toEqual({ id });
    expect(rpc).toHaveBeenNthCalledWith(1, "create_booking_request", args);
    expect(rpc).toHaveBeenNthCalledWith(2, "create_booking_request", args);
  });
  it("does not retry stale versions or exclusion conflicts", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "40001" } });
    await expect(bookingCommand({ rpc }, "cancel_booking", {})).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
describe("provider scheduling boundaries", () => {
  it("rejects client-chosen actors, duplicate resources and malformed windows", () => {
    expect(acceptSchema.safeParse({ expectedVersion: 2, resourceIds: [id, id] }).success).toBe(false);
    expect(acceptSchema.safeParse({ expectedVersion: 2, resourceIds: [id], actor: id }).success).toBe(false);
    expect(resourceSchema.safeParse({ providerId: id, kind: "vehicle", vehicleKey: "bad key", expectedVersion: 0 }).success).toBe(false);
    expect(availabilityRuleSchema.safeParse({ providerId: id, resourceId: id, weekday: 7, localStart: "09:00", localEnd: "17:00",
      effectiveFrom: "2027-01-01", effectiveTo: "2027-12-31", expectedVersion: 0 }).success).toBe(false);
    expect(blackoutSchema.safeParse({ providerId: id, resourceId: id, startAt: "2027-01-01T09:00:00Z", endAt: "2027-01-01T10:00:00Z",
      reason: "free text", expectedVersion: 1 }).success).toBe(false);
  });
});
describe("public availability boundary", () => {
  it("takes the public provider reference from search, never a provider UUID", () => {
    const ok = { provider: "SCV-DOC-100001", service: id, date: "2027-01-01" };
    expect(availabilitySchema.parse(ok)).toEqual(ok);
    expect(availabilitySchema.safeParse({ ...ok, provider: id }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...ok, provider: "SCV-XYZ-100001" }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...ok, provider: "SCV-DOC-1" }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...ok, providerId: id }).success).toBe(false);
  });
});
