import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import type { ReviewsApi } from "./api";
import { validateReviewInput } from "./schemas";
import type { Review, ReviewableVisit } from "./types";

type Store = { visits: Map<string, ReviewableVisit>; keys: Map<string, string> };
const WORLD_KEY = Symbol.for("scv.fixture.reviews");
const idSchema = z.uuid();

/** Synthetic booking ids used by the reviews fixture (not real bookings). */
export const REVIEW_FIXTURE_IDS = {
  doctorDue: "00000000-0000-4000-8000-0000000002a1",
  labDue: "00000000-0000-4000-8000-0000000002a2",
  pending: "00000000-0000-4000-8000-0000000002a3",
  published: "00000000-0000-4000-8000-0000000002a4",
  upcoming: "00000000-0000-4000-8000-0000000002a5",
} as const;

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function seed(now: Date, scenario: "empty" | "seeded"): ReviewableVisit[] {
  if (scenario === "empty") return [];
  const I = REVIEW_FIXTURE_IDS;
  const review = (bookingId: string, rating: Review["rating"], status: Review["status"], d: number): Review => ({
    id: bookingId.replace(/2a(\d)$/, "3a$1"), bookingId, rating, text: "Synthetic review text for testing only.", status, submittedAt: daysAgo(now, d),
  });
  return [
    { bookingId: I.doctorDue, bookingReference: "SYN-BKG-0201", category: "doctor", providerDisplayName: "Synthetic doctor 1", bookingState: "completed", completedAt: daysAgo(now, 3), review: null },
    { bookingId: I.labDue, bookingReference: "SYN-BKG-0202", category: "lab", providerDisplayName: "Synthetic lab provider", bookingState: "completed", completedAt: daysAgo(now, 9), review: null },
    { bookingId: I.pending, bookingReference: "SYN-BKG-0203", category: "caretaker", providerDisplayName: "Synthetic caretaker provider", bookingState: "completed", completedAt: daysAgo(now, 15), review: review(I.pending, 4, "pending_moderation", 14) },
    { bookingId: I.published, bookingReference: "SYN-BKG-0204", category: "doctor", providerDisplayName: "Synthetic doctor 2", bookingState: "completed", completedAt: daysAgo(now, 40), review: review(I.published, 5, "published", 38) },
    { bookingId: I.upcoming, bookingReference: "SYN-BKG-0205", category: "doctor", providerDisplayName: "Synthetic doctor 4", bookingState: "other", completedAt: null, review: null },
  ];
}

function storeFor(ownerId: string, scenario: "empty" | "seeded", now: Date): Store {
  const g = globalThis as typeof globalThis & { [WORLD_KEY]?: Map<string, Store> };
  g[WORLD_KEY] ??= new Map();
  let store = g[WORLD_KEY].get(ownerId);
  if (!store) {
    store = { visits: new Map(seed(now, scenario).map((v) => [v.bookingId, v])), keys: new Map() };
    g[WORLD_KEY].set(ownerId, store);
  }
  return store;
}

export type ReviewsFixtureOptions = { env?: FixtureEnvironment; ownerId: string | null; scenario?: "empty" | "seeded"; now?: () => Date };

/** Synthetic reviews adapter. Simulates eligibility and one-per-booking; not a security boundary. */
export function createReviewsFixtureApi(options: ReviewsFixtureOptions): ReviewsApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const store = () => (options.ownerId ? storeFor(options.ownerId, options.scenario ?? "seeded", now()) : null);
  const copy = (v: ReviewableVisit) => structuredClone(v);

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
      const v = idSchema.safeParse(id).success ? s.visits.get(id.toLowerCase()) : undefined;
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
      if (!parsed.ok) return fail("validation", { fields: Object.fromEntries(parsed.issues.map((i) => [i.field, i.code])) });
      const review: Review = { id: globalThis.crypto.randomUUID(), bookingId: v.bookingId, ...parsed.data, status: "pending_moderation", submittedAt: now().toISOString() };
      v.review = review;
      s.keys.set(key, v.bookingId);
      return ok({ ...review });
    },
  };
}
