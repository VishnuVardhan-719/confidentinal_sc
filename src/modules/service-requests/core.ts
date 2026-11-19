import { z } from "zod";
import type { ApiResult } from "@/lib/api/result";
import { paiseSchema, pinSchema, utcSchema, versionSchema } from "@/modules/catalog/schemas";

/**
 * Shared shape of a patient service request for the non-doctor services (lab tests, caretakers, scheduled
 * ambulance transfers). Each service module (lab-orders, care-requests, ambulance-requests) adds its own
 * provider catalogue, request input and details on top of this. The booking state, payment state and
 * clinical-record state stay separate fields so the UI never merges them into one badge.
 */
export const SERVICE_CATEGORIES = ["lab", "caretaker", "ambulance"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Booking states a patient can see on these requests (subset of the shared B01 states). */
export const REQUEST_STATUSES = ["REQUESTED", "ACCEPTED", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED", "EXPIRED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
/** States in which the provider still holds the time. */
export const ACTIVE_STATUSES: readonly RequestStatus[] = ["REQUESTED", "ACCEPTED", "CONFIRMED"];

/** Payment is pay-after-service only; live gateway payments stay disabled. */
export const PAYMENT_STATES = ["NOT_INITIATED", "DUE", "PAID"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Patient cancellation is free until this many minutes before the start (synthetic, not an approved policy). */
export const CANCEL_WINDOW_MINUTES = 120;

export const providerAreaSchema = z.object({ locality: z.string().min(1).max(80), city: z.string().min(1).max(60), pins: z.array(pinSchema).min(1) });
export type ProviderArea = z.infer<typeof providerAreaSchema>;

/** What every provider listing has. Service modules extend it with their own catalogue. */
export type BaseProvider = { id: string; category: ServiceCategory; name: string; area: ProviderArea; synthetic: boolean };

/** One priced line of the server's price snapshot (integer paise). `key` is a stable id; `label` is provider data. */
export const lineSchema = z.object({
  key: z.string().min(1).max(80), label: z.string().min(1).max(120), quantity: z.number().int().positive().max(100),
  unitPaise: paiseSchema, amountPaise: paiseSchema,
});
export type RequestLine = z.infer<typeof lineSchema>;

export const requestEventSchema = z.object({ status: requestStatusSchema, at: utcSchema, actor: z.enum(["patient", "provider", "system"]) });
export type RequestEvent = z.infer<typeof requestEventSchema>;

/** Address as it was when the request was sent: area only, no phone or free-text directions. */
export const addressSnapshotSchema = z.object({ label: z.enum(["home", "work", "other"]), locality: z.string().min(1).max(80), city: z.string().min(1).max(60), pin: pinSchema });
export type AddressSnapshot = z.infer<typeof addressSnapshotSchema>;

export function serviceRequestSchema<D extends z.ZodType>(details: D) {
  return z.object({
    id: z.uuid(), category: z.enum(SERVICE_CATEGORIES), providerId: z.uuid(), providerName: z.string().min(1).max(120), patientId: z.uuid(),
    address: addressSnapshotSchema, startAt: utcSchema, endAt: utcSchema, lines: z.array(lineSchema).min(1), totalPaise: paiseSchema,
    currency: z.literal("INR"), status: requestStatusSchema, version: versionSchema, publicReference: z.string().regex(/^SCV-[0-9A-Z]{6}$/).nullable(),
    payment: z.object({ status: z.enum(PAYMENT_STATES), amountDuePaise: paiseSchema }), details, events: z.array(requestEventSchema),
    createdAt: utcSchema, synthetic: z.boolean(),
  });
}
export type ServiceRequest<D> = Omit<z.infer<ReturnType<typeof serviceRequestSchema<z.ZodType<unknown>>>>, "details"> & { details: D };

export const requestSlotSchema = z.object({ startAt: utcSchema, endAt: utcSchema });
export type RequestSlot = z.infer<typeof requestSlotSchema>;

/** Fields every request form sends. The price is derived on the server; `expectedTotalPaise` only detects a change. */
export const baseRequestFields = {
  providerId: z.uuid(),
  patientId: z.uuid(),
  addressId: z.uuid(),
  startAt: utcSchema,
  policyAccepted: z.literal(true),
  expectedTotalPaise: paiseSchema,
  note: z.string().trim().max(200).optional(),
};

export const cancelRequestSchema = z.strictObject({ expectedVersion: versionSchema });
export const providerFilterSchema = z.strictObject({ pin: pinSchema.optional() });
export type ProviderFilter = z.infer<typeof providerFilterSchema>;

export interface ServiceRequestsApi<P extends BaseProvider, D> {
  listProviders(filter: ProviderFilter): Promise<ApiResult<{ items: P[]; synthetic: boolean }>>;
  getProvider(id: string): Promise<ApiResult<P>>;
  slots(providerId: string): Promise<ApiResult<{ items: RequestSlot[] }>>;
  create(input: unknown, idempotencyKey: string): Promise<ApiResult<{ id: string }>>;
  get(id: string): Promise<ApiResult<ServiceRequest<D>>>;
  list(): Promise<ApiResult<{ items: ServiceRequest<D>[] }>>;
  cancel(id: string, input: unknown): Promise<ApiResult<{ version: number }>>;
}

/** Sum of the lines. Every line is already integer paise. */
export function totalOf(lines: readonly RequestLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountPaise, 0);
}

/** Whether the patient may still cancel: always while the provider has not answered, then until the window closes. */
export function cancelState(request: Pick<ServiceRequest<unknown>, "status" | "startAt">, nowMs: number): "open" | "closed" | "final" {
  if (request.status === "REQUESTED") return "open";
  if (request.status !== "ACCEPTED" && request.status !== "CONFIRMED") return "final";
  return nowMs <= Date.parse(request.startAt) - CANCEL_WINDOW_MINUTES * 60_000 ? "open" : "closed";
}

/** Lead message key for the request page, by booking state. */
export function leadFor(status: RequestStatus): "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "expired" {
  switch (status) {
    case "REQUESTED": return "requested";
    case "ACCEPTED": case "CONFIRMED": return "confirmed";
    case "DECLINED": return "declined";
    case "CANCELLED": return "cancelled";
    case "COMPLETED": return "completed";
    default: return "expired";
  }
}

/** Server-made short display reference. The browser never derives references. */
export function referenceFor(id: string): string {
  return "SCV-" + id.replace(/-/g, "").slice(-6).toUpperCase();
}

/** True when [aStart, aEnd) and [bStart, bEnd) overlap. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}
