import { toAsciiDigits } from "@/components/shared/input-format";
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
  const pin = normalizePin(input.pin ?? "");
  const errors: FinderErrors = {};
  if (!pin) errors.pin = "pinRequired";
  else if (!isValidPin(pin)) errors.pin = "pinInvalid";
  if (!isServiceKey(input.service)) errors.service = "serviceRequired";
  if (errors.pin || errors.service) return { ok: false, errors };
  return { ok: true, href: finderHref(input.service as ServiceKey, pin) };
}
