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

/**
 * Patient-side statuses (feat/fe2-p src/modules/reviews) the doctor view never shows. `withdrawn` is
 * final and hidden: the server should omit it from the doctor feed (REQUESTS R-FE-Q-R9C5-1), and the
 * client drops it too, so one withdrawn row cannot make the whole page fail. Any other unknown status
 * still fails closed.
 */
export const DOCTOR_OMITTED_STATUSES = ["withdrawn"] as const;

/** Parse the doctor review feed: drop omitted statuses, then strictly parse the rest. */
export function parseDoctorReviewFeed(raw: unknown): { ok: true; data: DoctorReview[] } | { ok: false } {
  if (!Array.isArray(raw) || raw.length > 500) return { ok: false };
  const omitted = DOCTOR_OMITTED_STATUSES as readonly unknown[];
  const kept = raw.filter((row) => !(row !== null && typeof row === "object" && omitted.includes((row as { status?: unknown }).status)));
  const parsed = doctorReviewListSchema.safeParse(kept);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
}

export type PublishedReview = Extract<DoctorReview, { status: "published" }>;

/**
 * What the doctor page renders (ADVERSARIAL_REVIEW D2): published reviews as cards, newest first;
 * unpublished reviews only as counts. No per-row date or visit month for pending or rejected
 * reviews, so a doctor with few visits cannot tell which patient wrote one.
 */
export function doctorReviewsView(items: DoctorReview[]) {
  const published = sortReviews(items.filter((r): r is PublishedReview => r.status === "published"));
  const { average, pending, rejected } = summarizeReviews(items);
  return { published, average, pending, rejected };
}
/** Summary over PUBLISHED reviews only; null average when none. One decimal, never rounded up to 5. */
export function summarizeReviews(items: DoctorReview[]): { published: number; pending: number; rejected: number; average: number | null } {
  const pub = items.filter((r): r is Extract<DoctorReview, { status: "published" }> => r.status === "published");
  const average = pub.length ? Math.floor((pub.reduce((s, r) => s + r.rating, 0) / pub.length) * 10) / 10 : null;
  return { published: pub.length, pending: items.filter((r) => r.status === "pending_moderation").length, rejected: items.filter((r) => r.status === "rejected").length, average };
}

/** Newest first (by submission). */
export const sortReviews = <T extends DoctorReview>(items: T[]): T[] => [...items].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
