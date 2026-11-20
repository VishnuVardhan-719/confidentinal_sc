import { z } from "zod";
import { MODERATION_FILTERS, RATINGS, REJECTION_REASONS, REVIEW_ISSUES, REVIEW_STATUSES, REVIEW_TEXT_MAX, REVIEW_TEXT_MIN, type ModerationDecision, type ModerationFilter, type Review, type ReviewField, type ReviewInput, type ReviewIssue } from "./types";

// Contact details and links in a public review are refused (privacy and spam); moderation also checks.
const CONTACT = /(https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b\d[\d\s-]{8,}\d\b)/i;

export const reviewInputSchema = z.strictObject({
  rating: z.union(RATINGS.map((r) => z.literal(r)) as [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>], { message: "rating_required" }),
  text: z
    .string({ message: "text_too_short" })
    .transform((s) => s.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n"))
    .pipe(
      z
        .string()
        .min(REVIEW_TEXT_MIN, { message: "text_too_short" })
        .max(REVIEW_TEXT_MAX, { message: "text_too_long" })
        .refine((s) => !CONTACT.test(s), { message: "text_contact" }),
    ),
});

export type ReviewValidation = { ok: true; data: ReviewInput } | { ok: false; issues: { field: ReviewField; code: ReviewIssue }[] };

const FALLBACK: Record<ReviewField, ReviewIssue> = { rating: "rating_required", text: "text_too_short" };

/** Validate untrusted review input; one stable code per field, rating first. */
export function validateReviewInput(raw: unknown): ReviewValidation {
  const parsed = reviewInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data as ReviewInput };
  const issues: { field: ReviewField; code: ReviewIssue }[] = [];
  for (const field of ["rating", "text"] as const) {
    const issue = parsed.error.issues.find((i) => i.path[0] === field);
    if (!issue) continue;
    const known = (REVIEW_ISSUES as readonly string[]).includes(issue.message) ? (issue.message as ReviewIssue) : null;
    issues.push({ field, code: known ?? FALLBACK[field] });
  }
  if (issues.length === 0) issues.push({ field: "rating", code: "rating_required" });
  return { ok: false, issues };
}

export const reviewSchema = z.strictObject({
  id: z.uuid(),
  bookingId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(REVIEW_TEXT_MAX),
  status: z.enum(REVIEW_STATUSES),
  submittedAt: z.iso.datetime({ offset: true }),
  rejectionReason: z.enum(REJECTION_REASONS).nullable(),
  version: z.number().int().positive(),
}) as unknown as z.ZodType<Review>;

export const versionSchema = z.number().int().positive();

export const moderationDecisionSchema: z.ZodType<ModerationDecision> = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("publish") }),
  z.strictObject({ decision: z.literal("reject"), reason: z.enum(REJECTION_REASONS) }),
]);

/** URL filter for the moderation queue; anything unknown falls back to the pending queue. */
export function parseModerationFilter(value: unknown): ModerationFilter {
  return (MODERATION_FILTERS as readonly unknown[]).includes(value) ? (value as ModerationFilter) : "pending_moderation";
}
