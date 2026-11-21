import { z } from "zod";
import type { HttpClient } from "@/lib/api/http";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { utcSchema, versionSchema } from "@/modules/catalog/schemas";
import { rescheduleSchema, type BookingReschedule } from "./schemas";
import { istDate, SLOT_DAYS, slotQuerySchema, type Slot, type SlotQuery, type SlotsApi } from "./slots";

/**
 * B01 (PR #4) wiring for slots and reschedule, READY TO ENABLE but not used yet (R-FE-Q-C14-5,
 * docs/frontend/BACKEND_CONNECT_PLAN.md). `createSlotsHttpApi` and `BookingsApi.reschedule` still return
 * `gated`; switching them over is a one-line change in `modules/bookings/journey.ts` once B01 is merged and the
 * owner approves the contract. Pass an authenticated client: `createHttpClient(sessionHttpAuth())`.
 *
 * B01 shapes (origin/task/B01-booking, src/lib/validation/booking.ts and src/app/api/**):
 * - GET  /api/availability with query keys provider (uuid), service (uuid) and date (YYYY-MM-DD)
 *        -> { slots: [{ start_at, end_at, advisory }], advisory: true }   (one IST day per call)
 * - POST /api/bookings/:id/reschedule  body { expectedVersion, startAt }  header Idempotency-Key (uuid)
 *        -> 201 { id }   (the request_reschedule result; refetch the booking afterwards)
 */

export const availabilityResponseSchema = z.object({
  slots: z.array(z.object({ start_at: utcSchema, end_at: utcSchema, advisory: z.boolean() })).max(500),
  advisory: z.literal(true),
});

/** One B01 availability path for one IST calendar date. */
export function availabilityPath(query: SlotQuery, date: string): string | null {
  const parsed = slotQuerySchema.safeParse(query);
  if (!parsed.success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const params = new URLSearchParams({ provider: parsed.data.providerId.toLowerCase(), service: parsed.data.serviceId.toLowerCase(), date });
  return `/api/availability?${params}`;
}

/** The IST calendar dates the wizard offers, starting today in India. */
export function slotDates(now: Date, days: number = SLOT_DAYS): string[] {
  const first = istDate(now.getTime());
  const base = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * SlotsApi over B01: one GET per offered day, merged, de-duplicated and sorted. Any failing day fails the whole
 * list (no partial calendar that looks complete). Slots stay advisory: the server re-checks on create.
 */
export function createSlotsB01HttpApi(http: HttpClient, options: { days?: number; now?: () => Date } = {}): SlotsApi {
  const now = options.now ?? (() => new Date());
  return {
    async list(input) {
      const parsed = slotQuerySchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const items = new Map<string, Slot>();
      for (const date of slotDates(now(), options.days)) {
        const path = availabilityPath(parsed.data, date);
        if (!path) return fail("validation");
        const result = await http.request(path, availabilityResponseSchema);
        if (!result.ok) return result;
        for (const slot of result.data.slots) items.set(slot.start_at, { startAt: slot.start_at, endAt: slot.end_at });
      }
      return ok({ items: [...items.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)) });
    },
  };
}

export const rescheduleResponseSchema = z.object({ id: z.uuid() });

/**
 * Reschedule over B01. Returns B01's id (not a version), so the caller must refetch the booking; the type change
 * from `{ version }` is part of enabling it (BookingsApi.reschedule, RequestActions). Same idempotency key for
 * every retry of one intent.
 */
export async function rescheduleViaB01(http: HttpClient, bookingId: string, input: BookingReschedule, idempotencyKey: string): Promise<ApiResult<{ id: string }>> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!z.uuid().safeParse(bookingId).success || !parsed.success || !z.uuid().safeParse(idempotencyKey).success) return fail("validation");
  if (!versionSchema.safeParse(parsed.data.expectedVersion).success) return fail("validation");
  return http.request(`/api/bookings/${bookingId.toLowerCase()}/reschedule`, rescheduleResponseSchema,
    { method: "POST", body: { expectedVersion: parsed.data.expectedVersion, startAt: parsed.data.startAt }, idempotencyKey });
}
