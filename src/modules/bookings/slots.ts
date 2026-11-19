import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { utcSchema } from "@/modules/catalog/schemas";
import type { SyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { SYNTHETIC_DOCTORS } from "@/fixtures/marketplace/doctors";
import { syntheticBookable } from "@/fixtures/marketplace/providers";
import { overlapsActiveBooking } from "./fixture";

/** One bookable window offered by the provider. Start and end are UTC; the UI shows them in India time. */
export const slotSchema = z.object({ startAt: utcSchema, endAt: utcSchema });
export type Slot = z.infer<typeof slotSchema>;
export const slotQuerySchema = z.strictObject({ providerId: z.uuid(), serviceId: z.uuid() });
export type SlotQuery = z.infer<typeof slotQuerySchema>;

export interface SlotsApi {
  /** Open slots for the next few days. Advisory only: the server re-checks the slot when the request is created. */
  list(input: SlotQuery): Promise<ApiResult<{ items: Slot[] }>>;
}

/** No provider availability read contract exists on inspected backend refs (REQUESTS.md). Fail closed. */
export function createSlotsHttpApi(): SlotsApi {
  return { async list(input) { return fail(slotQuerySchema.safeParse(input).success ? "gated" : "validation"); } };
}

/** Synthetic India wall-clock start times (HH:MM) offered each day. */
export const SYNTHETIC_SLOT_TIMES = ["09:00", "10:30", "12:00", "15:00", "16:30", "18:00"] as const;
export const SLOT_DAYS = 5;
const IST_OFFSET_MS = 330 * 60_000;
/** Slots that start sooner than this are not offered, so a provider has time to respond. */
const LEAD_MS = 60 * 60_000;

/** IST calendar date (YYYY-MM-DD) of a UTC instant. Independent of the server and browser timezone. */
export function istDate(utc: string | number): string {
  return new Date(new Date(utc).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Fixture slots: the next SLOT_DAYS India calendar days at SYNTHETIC_SLOT_TIMES, minus slots that are too soon
 * and slots that overlap an active booking of the same provider in the shared synthetic store. A doctor the
 * fixture lists as fully booked (openSlots 0) has none.
 */
export function createSlotsFixtureApi(options: { env?: FixtureEnvironment; store: SyntheticMarketplaceStore; now?: () => Date }): SlotsApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  return {
    async list(input) {
      guard();
      const parsed = slotQuerySchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const service = syntheticBookable(parsed.data.serviceId);
      if (!service || service.id !== parsed.data.providerId.toLowerCase()) return fail("not_found");
      options.store.tick(now());
      const doctor = SYNTHETIC_DOCTORS.find(row => row.providerId === service.id);
      if (doctor && doctor.openSlots === 0) return ok({ items: [] });
      const nowMs = now().getTime();
      const items: Slot[] = [];
      for (let day = 0; day < SLOT_DAYS; day++) {
        const date = istDate(nowMs + day * 86_400_000);
        for (const time of SYNTHETIC_SLOT_TIMES) {
          const start = Date.parse(`${date}T${time}:00+05:30`);
          if (start < nowMs + LEAD_MS) continue;
          const slot = { startAt: new Date(start).toISOString(), endAt: new Date(start + service.durationMinutes * 60_000).toISOString() };
          if (!overlapsActiveBooking(options.store.records.values(), service.id, slot.startAt, slot.endAt)) items.push(slot);
        }
      }
      return ok({ items });
    },
  };
}
