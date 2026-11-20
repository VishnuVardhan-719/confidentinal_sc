import { z } from "zod";

/*
 * Shapes the browser reads from the catalog, availability and booking endpoints, plus the labels the
 * app shows for them. Responses are parsed, so an unexpected shape becomes an error state instead of a crash.
 */

export const API_CATEGORIES = ["doctor", "lab", "ambulance", "caretaker"] as const;
export type ApiCategory = (typeof API_CATEGORIES)[number];

/** Public URL slugs. The ambulance category is "scheduled-ambulance" on the site: planned transport only. */
export const CATEGORY_SLUGS = ["doctor", "lab", "scheduled-ambulance", "caretaker"] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const SLUG_TO_CATEGORY: Record<CategorySlug, ApiCategory> = {
  doctor: "doctor",
  lab: "lab",
  "scheduled-ambulance": "ambulance",
  caretaker: "caretaker",
};

export const CATEGORY_TO_SLUG: Record<ApiCategory, CategorySlug> = {
  doctor: "doctor",
  lab: "lab",
  ambulance: "scheduled-ambulance",
  caretaker: "caretaker",
};

export const CATEGORY_LABEL: Record<ApiCategory, string> = {
  doctor: "Doctor visit",
  lab: "Lab service",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker support",
};

export const PIN_RE = /^[1-9][0-9]{5}$/;
export const PROVIDER_REF_RE = /^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paise = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const labels = z.array(z.string()).optional();

export const catalogRowSchema = z.object({
  provider_reference: z.string().regex(PROVIDER_REF_RE),
  category: z.enum(API_CATEGORIES),
  display_name: z.string(),
  public_profile: z
    .object({
      description: z.string().optional(),
      specialty: z.string().optional(),
      qualification: z.string().optional(),
      languages: labels,
      years_experience: z.number().optional(),
      accreditation_label: z.string().optional(),
      home_collection: z.boolean().optional(),
      fleet_types: labels,
      skills: labels,
    })
    .partial()
    .optional(),
  service_id: z.string().regex(UUID_RE),
  service_title: z.string(),
  duration_minutes: z.number().int().positive(),
  amount_paise: paise,
  currency: z.literal("INR"),
  unit: z.string(),
  pin_code: z.string(),
  city: z.string(),
});
export type CatalogRow = z.infer<typeof catalogRowSchema>;

export const catalogPageSchema = z.object({ results: z.array(catalogRowSchema), nextCursor: z.string().nullable().optional() });

export const slotsSchema = z.object({
  slots: z.array(z.object({ start_at: z.string(), end_at: z.string() })),
});
export type Slot = z.infer<typeof slotsSchema>["slots"][number];

export const BOOKING_STATES = [
  "draft",
  "requested",
  "accepted",
  "confirmed",
  "in_progress",
  "completed",
  "declined",
  "expired",
  "cancelled",
  "no_show",
  "interrupted",
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const bookingSchema = z.object({
  id: z.string().regex(UUID_RE),
  public_ref: z.string(),
  provider_reference: z.string().nullable().optional(),
  category: z.enum(API_CATEGORIES),
  service_id: z.string(),
  pin_code: z.string().nullable().optional(),
  start_at: z.string(),
  end_at: z.string(),
  state: z.enum(BOOKING_STATES),
  version: z.number().int().positive(),
  amount_paise: paise,
  currency: z.string(),
  address_snapshot: z.object({ line1: z.string(), locality: z.string(), pin_code: z.string() }).partial().optional(),
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookingListSchema = z.object({ items: z.array(bookingSchema) });

export const STATE_LABEL: Record<BookingState, string> = {
  draft: "Draft",
  requested: "Waiting for provider",
  accepted: "Accepted",
  confirmed: "Confirmed by provider",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  no_show: "Missed",
  interrupted: "Interrupted",
};

const OPEN: readonly BookingState[] = ["draft", "requested", "accepted", "confirmed", "in_progress"];
const CANCELLABLE: readonly BookingState[] = ["requested", "accepted", "confirmed"];

export function isOpen(state: BookingState): boolean {
  return OPEN.includes(state);
}

/** Whether to offer "Cancel" at all. The server still decides, including the cancellation window. */
export function canCancel(booking: Pick<Booking, "state" | "start_at">, now = Date.now()): boolean {
  return CANCELLABLE.includes(booking.state) && new Date(booking.start_at).getTime() > now;
}

/** Upcoming = still open. Past = closed either way. Decided by state, not the clock. */
export function splitBookings(bookings: readonly Booking[]) {
  const byStart = (a: Booking, b: Booking) => a.start_at.localeCompare(b.start_at);
  return {
    upcoming: bookings.filter((b) => isOpen(b.state)).sort(byStart),
    past: bookings.filter((b) => !isOpen(b.state)).sort((a, b) => byStart(b, a)),
  };
}

/** Payment is not collected through the site. Booking state and payment state are separate. */
export const PAYMENT_LABEL = "Payment not collected online";

/**
 * Policy version recorded with the patient's consent when their patient record is created
 * (POST /api/auth/patient). The privacy notice is still a draft; the owner must replace this
 * with the approved notice version before real patients use the service.
 */
export const PATIENT_POLICY_VERSION = "privacy-notice-draft-2026-11";

export type BookingPrefill = { service?: CategorySlug; pin?: string; provider?: string; serviceId?: string };

/**
 * Reads /book?category=&pin=&provider=&service= links from the category pages. Query values are untrusted:
 * each is kept only if it has the exact shape the API accepts. Whether the provider exists is checked by
 * searching the catalog again, never by trusting the link.
 */
export function prefillFromParams(params: { get(name: string): string | null } | null): BookingPrefill {
  const category = params?.get("category") ?? "";
  const pin = params?.get("pin") ?? "";
  const provider = params?.get("provider") ?? "";
  const service = params?.get("service") ?? "";
  const out: BookingPrefill = {};
  if ((CATEGORY_SLUGS as readonly string[]).includes(category)) out.service = category as CategorySlug;
  if (PIN_RE.test(pin)) out.pin = pin;
  if (out.service && out.pin && PROVIDER_REF_RE.test(provider) && UUID_RE.test(service)) {
    out.provider = provider;
    out.serviceId = service;
  }
  return out;
}

export function bookHref(slug: CategorySlug, pin: string, row: Pick<CatalogRow, "provider_reference" | "service_id">): string {
  const q = new URLSearchParams({ category: slug, pin, provider: row.provider_reference, service: row.service_id });
  return `/book?${q.toString()}`;
}

export function choiceKey(row: Pick<CatalogRow, "provider_reference" | "service_id">): string {
  return `${row.provider_reference}|${row.service_id}`;
}
