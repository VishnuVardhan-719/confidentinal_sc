import { z } from "zod";

/**
 * Patient bookings list URL state. Only a display filter and an opaque booking-id cursor live in
 * the URL: no names, symptoms, addresses or other health data.
 *
 * The B01 list endpoint has no status filter, so the filter groups the bookings of the page that
 * was loaded. The page says so instead of implying a server-side search.
 */
export const BOOKING_FILTERS = ["all", "upcoming", "past", "cancelled"] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];
export const BOOKINGS_PAGE_SIZE = 10;

export type BookingsQuery = { filter: BookingFilter; cursor?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Unknown or malformed values fall back to the first page of "all"; they never reach the API. */
export function parseBookingsQuery(params: Record<string, string | string[] | undefined>): BookingsQuery {
  const status = first(params.status);
  const filter = BOOKING_FILTERS.find((f) => f === status) ?? "all";
  const rawCursor = first(params.cursor);
  const cursor = z.uuid().safeParse(rawCursor).success ? rawCursor!.toLowerCase() : undefined;
  return cursor ? { filter, cursor } : { filter };
}

/** Locale-less href (the i18n Link adds the locale). Defaults are omitted to keep URLs short. */
export function bookingsHref(query: BookingsQuery): string {
  const sp = new URLSearchParams();
  if (query.filter !== "all") sp.set("status", query.filter);
  if (query.cursor) sp.set("cursor", query.cursor);
  const qs = sp.toString();
  return "/patient/bookings" + (qs ? "?" + qs : "");
}

type Groups<T> = { upcoming: T[]; past: T[]; cancelled: T[] };

export function filterBookings<T>(groups: Groups<T>, filter: BookingFilter): T[] {
  return filter === "all" ? [...groups.upcoming, ...groups.past, ...groups.cancelled] : [...groups[filter]];
}

export function filterCounts<T>(groups: Groups<T>): Record<BookingFilter, number> {
  return {
    all: groups.upcoming.length + groups.past.length + groups.cancelled.length,
    upcoming: groups.upcoming.length,
    past: groups.past.length,
    cancelled: groups.cancelled.length,
  };
}
