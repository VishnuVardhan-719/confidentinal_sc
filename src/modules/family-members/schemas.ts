import { z } from "zod";
import { FAMILY_ISSUES, FAMILY_NAME_MAX, FAMILY_RELATIONS, type FamilyField, type FamilyIssue, type FamilyMember, type FamilyMemberInput } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OLDEST_YEARS = 120;

/** Today's calendar date in India (YYYY-MM-DD). DOB limits are judged in IST, not UTC. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True for a real calendar date (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole years between a DOB and `today` (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: string): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

// Letters (any script, with combining marks), spaces and . ' - only; must contain a letter.
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

const nameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, { message: "name_required" })
      .max(FAMILY_NAME_MAX, { message: "name_too_long" })
      .regex(NAME, { message: "name_invalid" }),
  );

export function familyMemberInputSchema(today: string = todayIst()) {
  return z.strictObject({
    displayName: nameSchema,
    relation: z.enum(FAMILY_RELATIONS, { message: "relation_required" }),
    dateOfBirth: z
      .string()
      .min(1, { message: "dob_required" })
      .refine(isCalendarDate, { message: "dob_invalid" })
      .refine((v) => !isCalendarDate(v) || v <= today, { message: "dob_future" })
      .refine((v) => !isCalendarDate(v) || ageOn(v, today) <= OLDEST_YEARS, { message: "dob_too_old" }),
  });
}

const FALLBACK: Record<FamilyField, FamilyIssue> = { displayName: "name_required", relation: "relation_required", dateOfBirth: "dob_required" };

export type FamilyValidation =
  | { ok: true; data: FamilyMemberInput }
  | { ok: false; issues: { field: FamilyField; code: FamilyIssue }[] };

/** Validate untrusted input; returns at most one issue per field, in form order. */
export function validateFamilyInput(raw: unknown, today: string = todayIst()): FamilyValidation {
  const parsed = familyMemberInputSchema(today).safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const order: FamilyField[] = ["displayName", "relation", "dateOfBirth"];
  const issues: { field: FamilyField; code: FamilyIssue }[] = [];
  for (const field of order) {
    const issue = parsed.error.issues.find((i) => i.path[0] === field);
    if (!issue) continue;
    // Type errors (missing key, wrong type) carry Zod's own message; map them to the field's "required".
    const known = (FAMILY_ISSUES as readonly string[]).includes(issue.message) ? (issue.message as FamilyIssue) : null;
    issues.push({ field, code: known ?? FALLBACK[field] });
  }
  // Unknown keys or a non-object body: report against the first field so the form still focuses.
  if (issues.length === 0) issues.push({ field: "displayName", code: "name_required" });
  return { ok: false, issues };
}

export const familyMemberSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().min(1).max(FAMILY_NAME_MAX),
  relation: z.enum(FAMILY_RELATIONS),
  dateOfBirth: z.string().refine(isCalendarDate),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
  synthetic: z.boolean(),
}) satisfies z.ZodType<FamilyMember>;

export const versionSchema = z.number().int().positive();
