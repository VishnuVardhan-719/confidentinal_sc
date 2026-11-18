import { HEALTH_ITEMS, patientMemberSchema, type PatientMember, type ProfileItemKey } from "./schemas";

export type BookingReadiness =
  | { kind: "ready"; done: number; total: number }
  | { kind: "incomplete"; done: number; total: number; missing: ProfileItemKey[] }
  /** No required items reported, an invalid record, or no booking grant: never bookable by default. */
  | { kind: "unknown" } | { kind: "not_permitted" };

/** Gate for booking step 1. Counts only server-reported required items; an empty list is unknown, not complete. */
export function bookingReadiness(input: PatientMember): BookingReadiness {
  const parsed = patientMemberSchema.safeParse(input);
  if (!parsed.success) return { kind: "unknown" };
  if (!parsed.data.canBook) return { kind: "not_permitted" };
  const required = parsed.data.profile.filter(item => item.required);
  if (required.length === 0) return { kind: "unknown" };
  const missing = required.filter(item => !item.done).map(item => item.key);
  const done = required.length - missing.length;
  return missing.length ? { kind: "incomplete", done, total: required.length, missing } : { kind: "ready", done, total: required.length };
}

/** Locale-less jump link into the profile owner's form (fe-b). Health items open the separate health record. */
export function profileItemHref(key: ProfileItemKey): string {
  return ((HEALTH_ITEMS as readonly string[]).includes(key) ? "/patient/health-profile" : "/patient/profile") + "#field-" + key;
}
