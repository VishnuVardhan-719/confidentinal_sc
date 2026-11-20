import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import type { ReviewModerationApi, ReviewsApi } from "./api";
import { moderationDecisionSchema, moderationPageRequestSchema, validateReviewInput, versionSchema } from "./schemas";
import { canChangeReview, canModerate } from "./status";
import type { ModerationFilter, ModerationItem, ModerationLogEntry, ModerationPage, Review, ReviewableVisit } from "./types";

type Store = { visits: Map<string, ReviewableVisit>; keys: Map<string, string> };
type World = Map<string, Store>;
const WORLD_KEY = Symbol.for("scv.fixture.reviews");
const idSchema = z.uuid();

/** Synthetic booking ids used by the reviews fixture (not real bookings). */
export const REVIEW_FIXTURE_IDS = {
  doctorDue: "00000000-0000-4000-8000-0000000002a1",
  labDue: "00000000-0000-4000-8000-0000000002a2",
  pending: "00000000-0000-4000-8000-0000000002a3",
  published: "00000000-0000-4000-8000-0000000002a4",
  upcoming: "00000000-0000-4000-8000-0000000002a5",
  rejected: "00000000-0000-4000-8000-0000000002a6",
  // Extra rows so parallel e2e projects never edit or withdraw the same review.
  rejectedB: "00000000-0000-4000-8000-0000000002a7",
  withdrawA: "00000000-0000-4000-8000-0000000002a8",
  withdrawB: "00000000-0000-4000-8000-0000000002a9",
} as const;

/** A second synthetic patient whose pending reviews fill the moderation queue. */
export const MODERATION_QUEUE_OWNER = "00000000-0000-4000-8000-0000000000c1";
export const QUEUE_FIXTURE_IDS = ["00000000-0000-4000-8000-0000000002b1", "00000000-0000-4000-8000-0000000002b2", "00000000-0000-4000-8000-0000000002b3"] as const;

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const reviewIdFor = (bookingId: string) => bookingId.replace(/02([ab])(\d)$/, "03$1$2");

function review(bookingId: string, rating: Review["rating"], status: Review["status"], at: string, text = "Synthetic review text for testing only."): Review {
  return { id: reviewIdFor(bookingId), bookingId, rating, text, status, submittedAt: at, rejectionReason: status === "rejected" ? "not_about_service" : null, version: 1 };
}

function seed(now: Date): ReviewableVisit[] {
  const I = REVIEW_FIXTURE_IDS;
  return [
    { bookingId: I.doctorDue, bookingReference: "SYN-BKG-0201", category: "doctor", providerDisplayName: "Synthetic doctor 1", bookingState: "completed", completedAt: daysAgo(now, 3), review: null },
    { bookingId: I.labDue, bookingReference: "SYN-BKG-0202", category: "lab", providerDisplayName: "Synthetic lab provider", bookingState: "completed", completedAt: daysAgo(now, 9), review: null },
    { bookingId: I.pending, bookingReference: "SYN-BKG-0203", category: "caretaker", providerDisplayName: "Synthetic caretaker provider", bookingState: "completed", completedAt: daysAgo(now, 15), review: review(I.pending, 4, "pending_moderation", daysAgo(now, 14)) },
    { bookingId: I.published, bookingReference: "SYN-BKG-0204", category: "doctor", providerDisplayName: "Synthetic doctor 2", bookingState: "completed", completedAt: daysAgo(now, 40), review: review(I.published, 5, "published", daysAgo(now, 38)) },
    { bookingId: I.upcoming, bookingReference: "SYN-BKG-0205", category: "doctor", providerDisplayName: "Synthetic doctor 4", bookingState: "other", completedAt: null, review: null },
    { bookingId: I.rejected, bookingReference: "SYN-BKG-0206", category: "lab", providerDisplayName: "Synthetic lab provider", bookingState: "completed", completedAt: daysAgo(now, 20), review: review(I.rejected, 2, "rejected", daysAgo(now, 19)) },
    { bookingId: I.rejectedB, bookingReference: "SYN-BKG-0207", category: "doctor", providerDisplayName: "Synthetic doctor 5", bookingState: "completed", completedAt: daysAgo(now, 22), review: review(I.rejectedB, 2, "rejected", daysAgo(now, 21)) },
    { bookingId: I.withdrawA, bookingReference: "SYN-BKG-0208", category: "doctor", providerDisplayName: "Synthetic doctor 6", bookingState: "completed", completedAt: daysAgo(now, 25), review: review(I.withdrawA, 3, "pending_moderation", daysAgo(now, 24)) },
    { bookingId: I.withdrawB, bookingReference: "SYN-BKG-0209", category: "caretaker", providerDisplayName: "Synthetic caretaker provider", bookingState: "completed", completedAt: daysAgo(now, 27), review: review(I.withdrawB, 3, "pending_moderation", daysAgo(now, 26)) },
  ];
}

function queueSeed(now: Date): ReviewableVisit[] {
  const [a, b, c] = QUEUE_FIXTURE_IDS;
  return [
    { bookingId: a, bookingReference: "SYN-BKG-0301", category: "doctor", providerDisplayName: "Synthetic doctor 5", bookingState: "completed", completedAt: daysAgo(now, 2), review: review(a, 5, "pending_moderation", daysAgo(now, 1), "Synthetic queue review one: on time and kind.") },
    { bookingId: b, bookingReference: "SYN-BKG-0302", category: "caretaker", providerDisplayName: "Synthetic caretaker provider", bookingState: "completed", completedAt: daysAgo(now, 4), review: review(b, 3, "pending_moderation", daysAgo(now, 3), "Synthetic queue review two: helpful but late.") },
    { bookingId: c, bookingReference: "SYN-BKG-0303", category: "lab", providerDisplayName: "Synthetic lab provider", bookingState: "completed", completedAt: daysAgo(now, 6), review: review(c, 1, "pending_moderation", daysAgo(now, 5), "Synthetic queue review three: sample collected late.") },
  ];
}

function world(): World {
  const g = globalThis as typeof globalThis & { [WORLD_KEY]?: World };
  g[WORLD_KEY] ??= new Map();
  return g[WORLD_KEY];
}

/** Stored log row: the decider id stays inside the adapter; reads expose only `decidedBySelf`. */
type LogRow = Omit<ModerationLogEntry, "decidedBySelf"> & { decidedBy: string };
const LOG_KEY = Symbol.for("scv.fixture.reviews.log");
/** A synthetic moderator other than the fixture session, credited with the seeded past decisions. */
export const SEEDED_MODERATOR_ID = "00000000-0000-4000-8000-0000000000d2";

function decisionLog(now: Date): LogRow[] {
  const g = globalThis as typeof globalThis & { [LOG_KEY]?: LogRow[] };
  // Past decisions matching the seeded published/rejected reviews (SYN-BKG-0204/0206/0207).
  g[LOG_KEY] ??= [
    { entryId: "00000000-0000-4000-8000-0000000004a1", bookingReference: "SYN-BKG-0204", category: "doctor", providerDisplayName: "Synthetic doctor 2", outcome: "published", reason: null, decidedAt: daysAgo(now, 37), decidedBy: SEEDED_MODERATOR_ID },
    { entryId: "00000000-0000-4000-8000-0000000004a2", bookingReference: "SYN-BKG-0206", category: "lab", providerDisplayName: "Synthetic lab provider", outcome: "rejected", reason: "not_about_service", decidedAt: daysAgo(now, 18), decidedBy: SEEDED_MODERATOR_ID },
    { entryId: "00000000-0000-4000-8000-0000000004a3", bookingReference: "SYN-BKG-0207", category: "doctor", providerDisplayName: "Synthetic doctor 5", outcome: "rejected", reason: "not_about_service", decidedAt: daysAgo(now, 20), decidedBy: SEEDED_MODERATOR_ID },
  ];
  return g[LOG_KEY];
}

function storeFor(ownerId: string, scenario: "empty" | "seeded", now: Date): Store {
  const w = world();
  let store = w.get(ownerId);
  if (!store) {
    const visits = scenario === "empty" ? [] : ownerId === MODERATION_QUEUE_OWNER ? queueSeed(now) : seed(now);
    store = { visits: new Map(visits.map((v) => [v.bookingId, v])), keys: new Map() };
    w.set(ownerId, store);
  }
  return store;
}

export type ReviewsFixtureOptions = { env?: FixtureEnvironment; ownerId: string | null; scenario?: "empty" | "seeded"; now?: () => Date };

/** Synthetic reviews adapter. Simulates eligibility, one-per-booking, edit and withdraw; not a security boundary. */
export function createReviewsFixtureApi(options: ReviewsFixtureOptions): ReviewsApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const store = () => (options.ownerId ? storeFor(options.ownerId, options.scenario ?? "seeded", now()) : null);
  const copy = (v: ReviewableVisit) => structuredClone(v);
  const owned = (s: Store, id: string) => (idSchema.safeParse(id).success ? s.visits.get(id.toLowerCase()) : undefined);
  const fieldsFail = (issues: { field: string; code: string }[]) => fail("validation", { fields: Object.fromEntries(issues.map((i) => [i.field, i.code])) });

  return {
    async listVisits() {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      return ok([...s.visits.values()].sort((a, b) => (b.completedAt ?? "9").localeCompare(a.completedAt ?? "9")).map(copy));
    },
    async getVisit(id) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      const v = owned(s, id);
      return v ? ok(copy(v)) : fail("not_found");
    },
    async submit(id, input, key) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!idSchema.safeParse(id).success || typeof key !== "string" || key.length < 8 || key.length > 128) return fail("validation");
      const v = s.visits.get(id.toLowerCase());
      if (!v) return fail("not_found");
      if (s.keys.get(key) === v.bookingId && v.review) return ok({ ...v.review }); // idempotent retry
      if (v.bookingState !== "completed") return fail("forbidden");
      if (v.review) return fail("conflict");
      const parsed = validateReviewInput(input);
      if (!parsed.ok) return fieldsFail(parsed.issues);
      const r: Review = { id: globalThis.crypto.randomUUID(), bookingId: v.bookingId, ...parsed.data, status: "pending_moderation", submittedAt: now().toISOString(), rejectionReason: null, version: 1 };
      v.review = r;
      s.keys.set(key, v.bookingId);
      return ok({ ...r });
    },
    async edit(id, input, expectedVersion) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const v = owned(s, id);
      if (!v || !v.review) return fail("not_found");
      if (!canChangeReview(v.review)) return fail("conflict");
      const parsed = validateReviewInput(input);
      if (!parsed.ok) return fieldsFail(parsed.issues);
      if (v.review.version !== expectedVersion) return fail("conflict");
      v.review = { ...v.review, ...parsed.data, status: "pending_moderation", rejectionReason: null, submittedAt: now().toISOString(), version: v.review.version + 1 };
      return ok({ ...v.review });
    },
    async withdraw(id, expectedVersion) {
      guard();
      const s = store();
      if (!s) return fail("unauthenticated");
      if (!versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const v = owned(s, id);
      if (!v || !v.review) return fail("not_found");
      if (!canChangeReview(v.review)) return fail("conflict");
      if (v.review.version !== expectedVersion) return fail("conflict");
      v.review = { ...v.review, status: "withdrawn", version: v.review.version + 1 };
      return ok({ ...v.review });
    },
  };
}

/**
 * Synthetic moderation adapter over every synthetic patient's reviews. The queue owner is seeded so
 * there is always work to moderate. Items carry the booking reference and provider only.
 */
/** Actor ids: uuids (fe2-p fixture session) or fixture profile ids such as `fx-adm-super` (integration sign-in). */
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Fixture cursor: a list code plus an offset (`p20`). Opaque to the UI, which only passes it back; it
 * carries no review or patient id, so the page URL stays free of identifiers. A cursor from another
 * list is refused. (The backend defines its own token.)
 */
const SCOPE_CODE: Record<string, string> = { pending_moderation: "p", published: "u", rejected: "r", log: "l" };
const encodeCursor = (scope: string, offset: number) => `${SCOPE_CODE[scope]}${offset}`;
function decodeCursor(scope: string, cursor: string): number | null {
  const m = /^([purl])(0|[1-9]\d{0,5})$/.exec(cursor);
  return m && m[1] === SCOPE_CODE[scope] ? Number(m[2]) : null;
}

/** Slice one page. An offset past the end (rows were decided since) is an empty last page, not an error. */
function pageOf<T>(rows: T[], scope: string, raw: unknown): { ok: true; page: ModerationPage<T> } | { ok: false } {
  const req = moderationPageRequestSchema.safeParse(raw ?? {});
  if (!req.success) return { ok: false };
  const offset = req.data.cursor === undefined ? 0 : decodeCursor(scope, req.data.cursor);
  if (offset === null) return { ok: false };
  const end = offset + req.data.limit;
  return { ok: true, page: { items: rows.slice(offset, end), nextCursor: end < rows.length ? encodeCursor(scope, end) : null } };
}

export function createReviewModerationFixtureApi(options: { env?: FixtureEnvironment; moderator: boolean; actorId?: string | null; now?: () => Date }): ReviewModerationApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const all = () => {
    storeFor(MODERATION_QUEUE_OWNER, "seeded", now());
    return [...world().values()].flatMap((s) => [...s.visits.values()]).filter((v): v is ReviewableVisit & { review: Review } => v.review !== null);
  };
  const item = (v: ReviewableVisit & { review: Review }): ModerationItem => ({
    reviewId: v.review.id,
    bookingReference: v.bookingReference,
    category: v.category,
    providerDisplayName: v.providerDisplayName,
    rating: v.review.rating,
    text: v.review.text,
    status: v.review.status,
    submittedAt: v.review.submittedAt,
    rejectionReason: v.review.rejectionReason,
    version: v.review.version,
  });

  return {
    async listQueue(filter: ModerationFilter, page) {
      guard();
      if (!options.moderator) return fail("forbidden");
      // Oldest first for the pending queue (first in, first decided); newest first otherwise.
      const rows = all().filter((v) => v.review.status === filter).map(item);
      rows.sort((a, b) => (filter === "pending_moderation" ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt)));
      const p = pageOf(rows, filter, page);
      return p.ok ? ok(p.page) : fail("validation");
    },
    async decide(reviewId, decision, expectedVersion) {
      guard();
      if (!options.moderator) return fail("forbidden");
      // A decision without a known decider is refused: every log row must be attributable.
      const actorId = options.actorId && ACTOR_ID.test(options.actorId) ? options.actorId.toLowerCase() : null;
      if (!actorId) return fail("forbidden");
      if (!idSchema.safeParse(reviewId).success || !versionSchema.safeParse(expectedVersion).success) return fail("validation");
      const parsed = moderationDecisionSchema.safeParse(decision);
      if (!parsed.success) return fail("validation");
      const v = all().find((x) => x.review.id === reviewId.toLowerCase());
      if (!v) return fail("not_found");
      if (!canModerate(v.review.status) || v.review.version !== expectedVersion) return fail("conflict");
      v.review = {
        ...v.review,
        status: parsed.data.decision === "publish" ? "published" : "rejected",
        rejectionReason: parsed.data.decision === "reject" ? parsed.data.reason : null,
        version: v.review.version + 1,
      };
      decisionLog(now()).push({
        entryId: globalThis.crypto.randomUUID(),
        bookingReference: v.bookingReference,
        category: v.category,
        providerDisplayName: v.providerDisplayName,
        outcome: v.review.status === "published" ? "published" : "rejected",
        reason: v.review.rejectionReason,
        decidedAt: now().toISOString(),
        decidedBy: actorId,
      });
      return ok(item(v));
    },
    async listDecisions(page) {
      guard();
      if (!options.moderator) return fail("forbidden");
      const self = options.actorId?.toLowerCase() ?? null;
      const rows = decisionLog(now()).map(({ decidedBy, ...rest }) => ({ ...rest, decidedBySelf: self !== null && decidedBy === self }));
      rows.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
      const p = pageOf(rows, "log", page);
      return p.ok ? ok(p.page) : fail("validation");
    },
  };
}
