import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { LOCALES, type Locale } from "@/lib/format";
import { paymentSummarySchema } from "@/modules/payments/schemas";
import type { PaymentsApi } from "@/modules/payments/api";
import type { BookingsApi } from "./api";
import { permittedActions } from "./actions";
import { bookingEventSchema, bookingSchema } from "./schemas";
import { bookingCard, groupPatientBookings } from "./view-model";

async function safe<T>(operation: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try { return await operation(); } catch { return fail("unavailable"); }
}
/** Every method authorizes anew. The caller must bind the real patient guard and
 * adapters to the current request/session. No permissive default and no cross-request cache.
 * These boundaries supplement the API/DB ownership checks; they do not replace them. */
export function createPatientBookingLoaders(options: {
  authorizePatient: () => Promise<ApiResult<null>>;
  api: Pick<BookingsApi, "list" | "get" | "timeline">;
  payments?: Pick<PaymentsApi, "getSummary">;
}) {
  return {
    async list(locale: Locale, nowUtc: string, page: { cursor?: string; limit?: number } = {}) {
      const authorized = await safe(options.authorizePatient);
      if (!authorized.ok) return authorized;
      if (!z.enum(LOCALES).safeParse(locale).success || !z.iso.datetime().safeParse(nowUtc).success) return fail("validation");
      const pagination = z.strictObject({ cursor: z.uuid().optional(), limit: z.number().int().min(1).max(50).default(20) }).safeParse(page);
      if (!pagination.success) return fail("validation");
      const result = await safe(() => options.api.list(pagination.data));
      if (!result.ok) return result;
      const parsed = z.object({ items: z.array(bookingSchema) }).safeParse(result.data);
      if (!parsed.success) return fail("unavailable");
      const groups = groupPatientBookings(parsed.data.items, nowUtc);
      const hasMore = parsed.data.items.length >= pagination.data.limit;
      const complete = !pagination.data.cursor && !hasMore;
      return ok({ scope: "loaded_page" as const, complete, hasMore, nextCursor: hasMore ? parsed.data.items.at(-1)?.id ?? null : null,
        nextVisitState: !complete ? "incomplete" as const : groups.upcoming.length ? "available" as const : "empty" as const,
        upcoming: groups.upcoming.map(item => bookingCard(item, locale)), past: groups.past.map(item => bookingCard(item, locale)), cancelled: groups.cancelled.map(item => bookingCard(item, locale)), nextVisit: complete && groups.upcoming[0] ? bookingCard(groups.upcoming[0], locale) : null });
    },
    async detail(id: string, locale: Locale) {
      const authorized = await safe(options.authorizePatient);
      if (!authorized.ok) return authorized;
      if (!z.uuid().safeParse(id).success || !z.enum(LOCALES).safeParse(locale).success) return fail("validation");
      const result = await safe(() => options.api.get(id));
      if (!result.ok) return result;
      const parsed = bookingSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.id !== id) return fail("unavailable");
      const paymentApi = options.payments;
      const [events, payment] = await Promise.all([
        safe(() => options.api.timeline(id)),
        paymentApi ? safe(() => paymentApi.getSummary(id)) : Promise.resolve(fail("gated")),
      ]);
      const timeline = events.ok ? z.object({ items: z.array(bookingEventSchema) }).safeParse(events.data) : null;
      const validatedEvents = events.ok ? timeline?.success && timeline.data.items.every(event => event.bookingId === id)
        ? ok(timeline.data) : fail("unavailable") : events;
      const summary = payment.ok ? paymentSummarySchema.safeParse(payment.data) : null;
      const validatedPayment = payment.ok ? summary?.success && summary.data.bookingId === id ? ok(summary.data) : fail("unavailable") : payment;
      return ok({ booking: parsed.data, card: bookingCard(parsed.data, locale), timeline: validatedEvents, payment: validatedPayment,
        actions: permittedActions({ status: parsed.data.status, category: parsed.data.category }, "patient") });
    },
  };
}
