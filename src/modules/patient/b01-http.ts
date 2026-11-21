import { z } from "zod";
import type { HttpClient } from "@/lib/api/http";
import { fail, type ApiResult } from "@/lib/api/result";
import { newAddressSchema } from "./schemas";

/**
 * B01 (PR #4) address save, READY TO ENABLE but not used yet (R-FE-Q-C14-5). `PatientApi.addAddress` still returns
 * `gated`. B01 `POST /api/patient/addresses` (origin/task/B01-booking, `addressSchema`) needs fields the current
 * form does not collect, so enabling needs three new form fields (line1, contactName, phone) and an owner
 * decision on `label` and `city`, which B01 does not store. There is no GET list route yet, so
 * `listAddresses` stays gated regardless.
 *
 * B01 body: { patientId, line1 (1-240), locality (1-120), pin, contactName (1-100), phone (+91 mobile),
 *             expectedVersion (0 for a new address), addressId? } -> 201 { id } (200 when updating)
 */

/** Indian mobile in B01's form: "+91" and 10 digits starting 6-9. Accepts "98765 43210", "+91-9876543210". */
export function toB01Phone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** The current form fields plus what B01 requires. Limits are B01's. */
export const b01AddressInputSchema = newAddressSchema.extend({
  line1: z.string().trim().min(1).max(240),
  contactName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(10).max(20),
}).refine(value => value.locality.length <= 120, { path: ["locality"] });
export type B01AddressInput = z.infer<typeof b01AddressInputSchema>;

export type B01AddressBody = {
  patientId: string; line1: string; locality: string; pin: string; contactName: string; phone: string; expectedVersion: number; addressId?: string;
};

/** Maps a validated form input to B01's body. `label` and `city` are not sent: B01 has no column for them. */
export function toB01AddressBody(patientId: string, input: unknown, options: { expectedVersion?: number; addressId?: string } = {}): B01AddressBody | null {
  const parsed = b01AddressInputSchema.safeParse(input);
  const phone = parsed.success ? toB01Phone(parsed.data.phone) : null;
  if (!parsed.success || !phone || !z.uuid().safeParse(patientId).success) return null;
  if (options.addressId !== undefined && !z.uuid().safeParse(options.addressId).success) return null;
  const expectedVersion = options.expectedVersion ?? 0;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return null;
  return {
    patientId: patientId.toLowerCase(), line1: parsed.data.line1, locality: parsed.data.locality, pin: parsed.data.pin,
    contactName: parsed.data.contactName, phone, expectedVersion, ...(options.addressId ? { addressId: options.addressId.toLowerCase() } : {}),
  };
}

export async function saveAddressViaB01(http: HttpClient, patientId: string, input: unknown, options: { expectedVersion?: number; addressId?: string } = {}): Promise<ApiResult<{ id: string }>> {
  const body = toB01AddressBody(patientId, input, options);
  if (!body) return fail("validation");
  return http.request("/api/patient/addresses", z.object({ id: z.uuid() }), { method: "POST", body });
}
