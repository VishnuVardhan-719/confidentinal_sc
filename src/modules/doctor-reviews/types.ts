import { z } from "zod";

/**
 * Doctor-side, read-only view of patient reviews about the signed-in doctor. Statuses match the
 * patient reviews contract on feat/fe2-p (src/modules/reviews: pending_moderation | published |
 * rejected; rating 1-5; text up to 1000). Privacy: no patient name, booking reference or exact
 * visit date (only the visit month), and rating/text are present ONLY once moderation published the
 * review, so a doctor never sees an unmoderated or removed review.
 */
export const REVIEW_STATUSES = ["pending_moderation", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_TEXT_MAX = 1000;

const isoTime = z.iso.datetime({ offset: true });
const base = { id: z.uuid(), visitMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), submittedAt: isoTime };

export const doctorReviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...base, status: z.literal("published"), rating: z.number().int().min(1).max(5), text: z.string().min(1).max(REVIEW_TEXT_MAX), publishedAt: isoTime }),
  z.strictObject({ ...base, status: z.literal("pending_moderation") }),
  z.strictObject({ ...base, status: z.literal("rejected") }),
]);
export type DoctorReview = z.infer<typeof doctorReviewSchema>;
export const doctorReviewListSchema = z.array(doctorReviewSchema).max(500);

export const REVIEW_FILTERS = ["all", ...REVIEW_STATUSES] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
export const parseReviewFilter = (raw: unknown): ReviewFilter => (REVIEW_FILTERS as readonly unknown[]).includes(raw) ? (raw as ReviewFilter) : "all";

/** Summary over PUBLISHED reviews only; null average when none. One decimal, never rounded up to 5. */
export function summarizeReviews(items: DoctorReview[]): { published: number; pending: number; rejected: number; average: number | null } {
  const pub = items.filter((r): r is Extract<DoctorReview, { status: "published" }> => r.status === "published");
  const average = pub.length ? Math.floor((pub.reduce((s, r) => s + r.rating, 0) / pub.length) * 10) / 10 : null;
  return { published: pub.length, pending: items.filter((r) => r.status === "pending_moderation").length, rejected: items.filter((r) => r.status === "rejected").length, average };
}

/** Newest first (by submission). */
export const sortReviews = (items: DoctorReview[]): DoctorReview[] => [...items].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
