import { z } from "zod";
import { createHttpClient, type HttpClient } from "@/lib/api/http";
import { fail, ok } from "@/lib/api/result";
import { versionSchema } from "@/modules/catalog/schemas";
import { acceptSchema, bookingListSchema, bookingWireSchema, createBookingSchema, decisionSchema } from "./schemas";
import type { BookingsApi } from "./api";
/** 409 remains conflict; never retry stale versions or optimistic booking mutations.
 * Refetch get(id), re-review changes and explicitly decide again. */
export function createBookingsHttpApi(http: HttpClient = createHttpClient()): BookingsApi {
  async function decision<T>(id: string, value: T, schema: z.ZodType<T>, action: "accept" | "decline" | "cancel") {
    const parsed = schema.safeParse(value);
    if (!z.uuid().safeParse(id).success || !parsed.success) return fail("validation");
    return http.request("/api/bookings/" + id + "/" + action, z.object({ version: versionSchema }), { method: "POST", body: parsed.data });
  }
  return {
    async create(input, idempotencyKey) {
      const parsed = createBookingSchema.safeParse(input);
      if (!parsed.success || !z.uuid().safeParse(idempotencyKey).success) return fail("validation");
      return http.request("/api/bookings", z.object({ id: z.uuid() }), { method: "POST", body: parsed.data, idempotencyKey });
    },
    async list(filters = {}) {
      const parsed = bookingListSchema.safeParse(filters);
      if (!parsed.success) return fail("validation");
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(parsed.data)) if (value !== undefined) params.set(key, String(value));
      return http.request("/api/bookings?" + params, z.object({ items: z.array(bookingWireSchema) }));
    },
    async get(id) {
      if (!z.uuid().safeParse(id).success) return fail("validation");
      const result = await http.request("/api/bookings/" + id, z.object({ booking: bookingWireSchema }));
      return result.ok ? ok(result.data.booking) : result;
    },
    accept: (id, value) => decision(id, value, acceptSchema, "accept"),
    decline: (id, value) => decision(id, value, decisionSchema, "decline"),
    cancel: (id, value) => decision(id, value, decisionSchema, "cancel"),
    async timeline(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "validation"); },
  };
}
