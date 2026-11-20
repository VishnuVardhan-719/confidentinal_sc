import { describe, expect, it } from "vitest";
import { DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { doctorReviewSchema, getDoctorReviewsApi, parseReviewFilter, sortReviews, summarizeReviews, type DoctorReview } from "@/modules/doctor-reviews";
import { createDoctorReviewsFixtureApi, projectForDoctor, seedReviews } from "@/modules/doctor-reviews/fixture";
import en from "@/messages/en/doctorReviews.json";
import te from "@/messages/te/doctorReviews.json";
import hi from "@/messages/hi/doctorReviews.json";

const env = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
const T0 = new Date("2026-11-19T10:00:00Z");

describe("doctor reviews fixture", () => {
  it("returns only the signed-in doctor's reviews", async () => {
    const r = await createDoctorReviewsFixtureApi({ env, actor: DEFAULT_DOCTOR_ACTOR, now: () => T0 }).listMine();
    expect(r.ok && r.data).toHaveLength(4);
    const other = await createDoctorReviewsFixtureApi({ env, actor: { role: "doctor", doctorId: I.doctorOther }, now: () => T0 }).listMine();
    expect(other).toEqual({ ok: true, data: [] });
    expect(await createDoctorReviewsFixtureApi({ env, actor: DEFAULT_PATIENT_ACTOR }).listMine()).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("never exposes rating or text unless moderation published the review", async () => {
    const r = await createDoctorReviewsFixtureApi({ env, actor: DEFAULT_DOCTOR_ACTOR, now: () => T0 }).listMine();
    if (!r.ok) throw new Error("expected ok");
    const json = JSON.stringify(r.data);
    expect(json).not.toMatch(/must not reach the doctor/);
    for (const x of r.data) if (x.status !== "published") expect(Object.keys(x).sort()).toEqual(["id", "status", "submittedAt", "visitMonth"]);
    // No patient identity or booking reference in any projection.
    expect(json).not.toMatch(/Fixture Patient|SYN-BKG|patientId|bookingId/);
  });

  it("a 'published' record without a publish time is treated as awaiting moderation", () => {
    const raw = { ...seedReviews(T0)[0], publishedAt: null };
    expect(projectForDoctor(raw)).toMatchObject({ status: "pending_moderation" });
    expect(projectForDoctor(raw)).not.toHaveProperty("text");
  });

  it("schema rejects text on unpublished reviews and extra fields", () => {
    const base = { id: "00000000-0000-4000-8000-0000000000a9", visitMonth: "2026-10", submittedAt: T0.toISOString() };
    expect(doctorReviewSchema.safeParse({ ...base, status: "pending_moderation", text: "x" }).success).toBe(false);
    expect(doctorReviewSchema.safeParse({ ...base, status: "published", rating: 6, text: "x", publishedAt: T0.toISOString() }).success).toBe(false);
    expect(doctorReviewSchema.safeParse({ ...base, status: "published", rating: 4, text: "x", publishedAt: T0.toISOString(), patientName: "y" }).success).toBe(false);
  });
});

describe("summary, sort and filter", () => {
  const pub = (id: string, rating: number, at: string): DoctorReview => ({ id, status: "published", rating, text: "t", visitMonth: "2026-10", submittedAt: at, publishedAt: at });
  it("averages published reviews only, one decimal, rounded down", () => {
    const items: DoctorReview[] = [pub("a", 5, "2026-11-01T00:00:00Z"), pub("b", 4, "2026-11-02T00:00:00Z"), pub("c", 4, "2026-11-03T00:00:00Z"), { id: "d", status: "rejected", visitMonth: "2026-10", submittedAt: "2026-11-04T00:00:00Z" }];
    expect(summarizeReviews(items)).toEqual({ published: 3, pending: 0, rejected: 1, average: 4.3 });
    expect(summarizeReviews([]).average).toBeNull();
    expect(sortReviews(items).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
  it("unknown filters fall back to all", () => {
    expect(parseReviewFilter("published")).toBe("published");
    expect(parseReviewFilter("<script>")).toBe("all");
    expect(parseReviewFilter(["published"])).toBe("all");
  });
});

describe("gates and messages", () => {
  it("flag off and http are gated; fixture refused in production", async () => {
    expect(await getDoctorReviewsApi({ FRONTEND_ADAPTER: "fixture" }, { fixtureActor: DEFAULT_DOCTOR_ACTOR }).listMine()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await getDoctorReviewsApi({ FEATURE_CLINICAL: "true" }).listMine()).toEqual({ ok: false, error: { code: "gated" } });
    expect(() => getDoctorReviewsApi({ ...env, APP_ENV: "production" }, { fixtureActor: DEFAULT_DOCTOR_ACTOR })).toThrow();
  });
  it("en, te and hi have the same keys", () => {
    const flat = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(flat(te).sort()).toEqual(flat(en).sort());
    expect(flat(hi).sort()).toEqual(flat(en).sort());
  });
});
