import { z } from "zod";
import { formatDateTime, formatPaise, LOCALES, type Locale } from "@/lib/format";
import { bookingSchema, type Booking } from "./schemas";

export function bookingCard(input: Booking, locale: Locale) {
  const booking = bookingSchema.parse(input);
  z.enum(LOCALES).parse(locale);
  return { id: booking.id, reference: booking.publicReference, category: booking.category, status: booking.status,
    operationalStatus: booking.doctorOperationalStatus, start: formatDateTime(booking.startAt, locale),
    end: formatDateTime(booking.endAt, locale), price: formatPaise(booking.priceSnapshot.amountPaise, locale),
    synthetic: booking.synthetic, href: "/" + locale + "/patient/bookings/" + booking.id };
}
/** Timing is display grouping only, never a server transition or payment inference. */
export function groupPatientBookings(input: Booking[], nowUtc: string) {
  const now = Date.parse(z.iso.datetime().parse(nowUtc));
  const groups: { upcoming: Booking[]; past: Booking[]; cancelled: Booking[] } = { upcoming: [], past: [], cancelled: [] };
  for (const item of input) {
    const booking = bookingSchema.parse(item);
    if (["CANCELLED", "DECLINED", "EXPIRED", "INTERRUPTED", "NO_SHOW"].includes(booking.status)) groups.cancelled.push(booking);
    else if (booking.status === "COMPLETED" || Date.parse(booking.endAt) <= now) groups.past.push(booking);
    else groups.upcoming.push(booking);
  }
  groups.upcoming.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
  for (const list of [groups.past, groups.cancelled]) list.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt) || a.id.localeCompare(b.id));
  return groups;
}
