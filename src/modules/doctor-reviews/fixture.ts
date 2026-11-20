import { fail, ok } from "@/lib/api/result";
import { assertFixtureAllowed, FIXTURE_IDS as I, NO_ACTOR, type FixtureActor } from "@/fixtures/clinical/world";
import type { DoctorReviewsApi } from "./api";
import { parseDoctorReviewFeed, type DoctorReview } from "./types";

type Env = Record<string, string | undefined>;

/** Raw moderation records as the backend would hold them (patient text exists even when not shown). */
type RawReview = { id: string; doctorId: string; status: DoctorReview["status"] | "withdrawn"; rating: number; text: string; visitAt: string; submittedAt: string; publishedAt: string | null };

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

/** Synthetic reviews: the assigned fixture doctor has all three states plus one withdrawn review; the other doctor has none. */
export function seedReviews(now: Date = new Date()): RawReview[] {
  const d = I.doctorAssigned;
  return [
    { id: "00000000-0000-4000-8000-0000000000a1", doctorId: d, status: "published", rating: 5, text: "Synthetic review: the doctor arrived on time and explained everything clearly.", visitAt: daysAgo(now, 40), submittedAt: daysAgo(now, 38), publishedAt: daysAgo(now, 37) },
    { id: "00000000-0000-4000-8000-0000000000a2", doctorId: d, status: "published", rating: 4, text: "Synthetic review: helpful visit, a little rushed at the end.", visitAt: daysAgo(now, 20), submittedAt: daysAgo(now, 19), publishedAt: daysAgo(now, 18) },
    { id: "00000000-0000-4000-8000-0000000000a3", doctorId: d, status: "pending_moderation", rating: 2, text: "Synthetic unmoderated text that must not reach the doctor.", visitAt: daysAgo(now, 8), submittedAt: daysAgo(now, 7), publishedAt: null },
    { id: "00000000-0000-4000-8000-0000000000a4", doctorId: d, status: "rejected", rating: 1, text: "Synthetic removed text that must not reach the doctor.", visitAt: daysAgo(now, 15), submittedAt: daysAgo(now, 14), publishedAt: null },
    { id: "00000000-0000-4000-8000-0000000000a5", doctorId: d, status: "withdrawn", rating: 3, text: "Synthetic withdrawn text that must not reach the doctor.", visitAt: daysAgo(now, 30), submittedAt: daysAgo(now, 29), publishedAt: null },
  ];
}

const monthIst = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);

/**
 * Server-side projection: only moderation-published reviews carry rating and text. Withdrawn rows are
 * still emitted (bare), as a server that has not adopted R-FE-Q-R9C5-1 would, so the client drop is exercised.
 */
export function projectForDoctor(r: RawReview): DoctorReview | { id: string; visitMonth: string; submittedAt: string; status: "withdrawn" } {
  const base = { id: r.id, visitMonth: monthIst(r.visitAt), submittedAt: r.submittedAt };
  if (r.status === "withdrawn") return { ...base, status: "withdrawn" };
  if (r.status === "published" && r.publishedAt) return { ...base, status: "published", rating: r.rating, text: r.text, publishedAt: r.publishedAt };
  return { ...base, status: r.status === "published" ? "pending_moderation" : r.status } as DoctorReview;
}

export function createDoctorReviewsFixtureApi({ env = process.env, actor = NO_ACTOR, reviews, now = () => new Date() }: { env?: Env; actor?: FixtureActor; reviews?: RawReview[]; now?: () => Date } = {}): DoctorReviewsApi {
  assertFixtureAllowed(env);
  const source = reviews ?? seedReviews(now());
  return {
    listMine: async () => {
      if (actor.role !== "doctor") return fail("forbidden");
      const mine = source.filter((r) => r.doctorId === actor.doctorId).map(projectForDoctor);
      const parsed = parseDoctorReviewFeed(mine);
      return parsed.ok ? ok(parsed.data) : fail("unavailable");
    },
  };
}
