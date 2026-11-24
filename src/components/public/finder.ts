import { toAsciiDigits } from "@/components/shared/input-format";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/routing";
import { resolveLocation } from "./localities";
import { SERVICES, type ServiceKey } from "./routes";

/** Indian PIN shape: 6 digits, first digit 1-9. Shape only; the server decides whether it is served. */
export const PIN_PATTERN_SOURCE = "[1-9][0-9]{5}";
const PIN_RE = new RegExp(`^${PIN_PATTERN_SOURCE}$`);

export function normalizePin(input: string): string {
  return toAsciiDigits(input).slice(0, 6);
}

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === "string" && SERVICES.some((s) => s.key === value);
}

/** Locale-less directory URL for a service + PIN, e.g. "/lab-tests?pin=500001". */
export function finderHref(service: ServiceKey, pin: string): string {
  const base = SERVICES.find((s) => s.key === service)!.href;
  return `${base}?${new URLSearchParams({ pin }).toString()}`;
}

export type FinderErrors = { pin?: "pinRequired" | "pinInvalid"; service?: "serviceRequired" };
export type FinderResult = { ok: true; href: string } | { ok: false; errors: FinderErrors };

export function validateFinder(input: { pin?: string | null; service?: string | null }): FinderResult {
  // The field holds a 6-digit PIN or a locality name. A PIN is taken whole, never truncated:
  // "5000019" must be rejected, not shortened to a valid PIN.
  const typed = (input.pin ?? "").trim();
  const resolved = resolveLocation(typed);
  const errors: FinderErrors = {};
  if (!typed) errors.pin = "pinRequired";
  else if (!resolved) errors.pin = "pinInvalid";
  if (!isServiceKey(input.service)) errors.service = "serviceRequired";
  if (errors.pin || errors.service || !resolved) return { ok: false, errors };
  return { ok: true, href: finderHref(input.service as ServiceKey, resolved.pin) };
}

/**
 * Doctor search URL (landing hero search). Mirrors the /doctors results contract on feat/fe2-c
 * (`doctorSearchSchema` in src/modules/providers/doctor-search.ts):
 *   q    - 1..80 chars of letters, digits, spaces and . , ' & ( ) -
 *   pin  - 6-digit PIN when the location field holds one
 *   city - 2..60 chars, starts with a letter; letters, spaces and . ' -
 * Anything else is cleaned out or omitted, so the results page never rejects the URL. Combining marks
 * (\p{M}) are kept: Telugu and Hindi words need them (REQUESTS R-FE01-11).
 * Only coarse location ever goes in the URL; never coordinates.
 */
export function cleanDoctorQuery(raw: string | null | undefined): string {
  return (raw ?? "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N} .,'&()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
}

export function cleanCity(raw: string | null | undefined): string | null {
  const city = (raw ?? "").normalize("NFC").replace(/[^\p{L}\p{M} .'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return city.length >= 2 && /^\p{L}/u.test(city) ? city : null;
}

export function doctorSearchHref(input: { q?: string | null; location?: string | null }): string {
  const params = new URLSearchParams();
  const q = cleanDoctorQuery(input.q);
  const loc = (input.location ?? "").trim();
  if (q) params.set("q", q);
  if (loc && /^[\s\d०-९౦-౯]+$/.test(loc)) {
    // All-digit location: use it only if it is exactly a valid PIN (no truncation); otherwise omit it.
    const pin = toAsciiDigits(loc);
    if (isValidPin(pin)) params.set("pin", pin);
  } else {
    const city = cleanCity(loc);
    if (city) params.set("city", city);
  }
  const query = params.toString();
  return query ? `/doctors?${query}` : "/doctors";
}

/**
 * Relative Location for GET /{locale}/find (no Host header involved). Valid -> /{locale}/{service}?pin=;
 * otherwise back to the landing finder with ?finder=invalid#finder. Unknown locales fall back to en.
 */
export function finderRedirectPath(rawLocale: string, pin: string | null, service: string | null): string {
  const locale = isAppLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const result = validateFinder({ pin, service });
  return result.ok ? `/${locale}${result.href}` : `/${locale}?finder=invalid#finder`;
}
