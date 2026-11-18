import { DEMO_PROVIDERS, providerById, providersByKind, type DemoProvider } from "@/lib/demo/data";
import { getCategory, type Category } from "../data";

/** Demo provider kinds per public category. Caretaker has no demo providers yet. */
const KIND_FOR_SLUG: Record<Category["slug"], DemoProvider["kind"] | null> = {
  doctor: "doctor",
  lab: "lab",
  "scheduled-ambulance": "ambulance",
  caretaker: null,
};

const SLUG_FOR_KIND: Record<DemoProvider["kind"], Category["slug"]> = {
  doctor: "doctor",
  lab: "lab",
  ambulance: "scheduled-ambulance",
};

/** What a provider card needs. Plain data so it can cross into client components. */
export type ProviderCard = {
  id: string;
  name: string;
  speciality: string;
  city: string;
  languages: string[];
  fromPaise: number | null;
};

export function toCard(p: DemoProvider): ProviderCard {
  const prices = p.services.map((s) => s.pricePaise);
  return {
    id: p.id,
    name: p.name,
    speciality: p.speciality,
    city: p.city,
    languages: [...p.languages],
    fromPaise: prices.length ? Math.min(...prices) : null,
  };
}

export function cardsForCategory(slug: string): ProviderCard[] {
  const kind = KIND_FOR_SLUG[slug as Category["slug"]];
  return kind ? providersByKind(kind).map(toCard) : [];
}

export function categoryForProvider(p: DemoProvider): Category | undefined {
  return getCategory(SLUG_FOR_KIND[p.kind]);
}

export function allProviderIds(): string[] {
  return DEMO_PROVIDERS.map((p) => p.id);
}

export { providerById };

export type Filters = { city: string; language: string };
export const ANY = "";

/** Sorted unique values for the filter selects. */
export function filterOptions(cards: readonly ProviderCard[]) {
  const sort = (a: string, b: string) => a.localeCompare(b, "en");
  return {
    cities: [...new Set(cards.map((c) => c.city))].sort(sort),
    languages: [...new Set(cards.flatMap((c) => c.languages))].sort(sort),
  };
}

export function filterCards(cards: readonly ProviderCard[], f: Filters): ProviderCard[] {
  return cards.filter((c) => (f.city === ANY || c.city === f.city) && (f.language === ANY || c.languages.includes(f.language)));
}

const IST: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };
const dayFmt = new Intl.DateTimeFormat("en-IN", { ...IST, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { ...IST, hour: "numeric", minute: "2-digit", hour12: true });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { ...IST, year: "numeric", month: "2-digit", day: "2-digit" });

export type SlotOption = { iso: string; dayKey: string; day: string; time: string };
export type SlotDay = { dayKey: string; day: string; slots: SlotOption[] };

/**
 * Slots are stored in UTC and shown in IST. Formatting happens on the server and is passed down as
 * strings, so server and browser ICU differences can never cause a hydration mismatch.
 */
export function slotDays(isoSlots: readonly string[]): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const iso of [...isoSlots].sort()) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    const dayKey = dayKeyFmt.format(at);
    const slot: SlotOption = { iso, dayKey, day: dayFmt.format(at), time: timeFmt.format(at).replace(/\s?(am|pm)$/i, (m) => m.toUpperCase()) };
    const bucket = days.get(dayKey) ?? { dayKey, day: slot.day, slots: [] };
    bucket.slots.push(slot);
    days.set(dayKey, bucket);
  }
  return [...days.values()];
}

/** Link into the demo request flow. Only ids travel; the price is looked up again on the booking side. */
export function bookHref(providerId: string, serviceId: string, slotIso: string): string {
  const q = new URLSearchParams({ provider: providerId, service: serviceId, slot: slotIso });
  return `/book?${q.toString()}`;
}
