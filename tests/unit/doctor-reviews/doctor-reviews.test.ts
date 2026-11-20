import { describe, expect, it } from "vitest";
import { DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { DOCTOR_OMITTED_STATUSES, doctorReviewSchema, doctorReviewsView, getDoctorReviewsApi, parseDoctorReviewFeed, sortReviews, summarizeReviews, type DoctorReview } from "@/modules/doctor-reviews";
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

describe("summary and sort", () => {
  const pub = (id: string, rating: number, at: string): DoctorReview => ({ id, status: "published", rating, text: "t", visitMonth: "2026-10", submittedAt: at, publishedAt: at });
  it("averages published reviews only, one decimal, rounded down", () => {
    const items: DoctorReview[] = [pub("a", 5, "2026-11-01T00:00:00Z"), pub("b", 4, "2026-11-02T00:00:00Z"), pub("c", 4, "2026-11-03T00:00:00Z"), { id: "d", status: "rejected", visitMonth: "2026-10", submittedAt: "2026-11-04T00:00:00Z" }];
    expect(summarizeReviews(items)).toEqual({ published: 3, pending: 0, rejected: 1, average: 4.3 });
    expect(summarizeReviews([]).average).toBeNull();
    expect(sortReviews(items).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("D1: withdrawn reviews never break the doctor feed", () => {
  const base = { visitMonth: "2026-10", submittedAt: "2026-11-01T00:00:00Z" };
  const good = [
    { ...base, id: "00000000-0000-4000-8000-0000000000b1", status: "published", rating: 5, text: "t", publishedAt: "2026-11-02T00:00:00Z" },
    { ...base, id: "00000000-0000-4000-8000-0000000000b2", status: "pending_moderation" },
  ];
  it("drops withdrawn rows and keeps the rest", () => {
    const r = parseDoctorReviewFeed([...good, { ...base, id: "00000000-0000-4000-8000-0000000000b3", status: "withdrawn" }]);
    expect(r.ok && r.data.map((x) => x.id)).toEqual(["00000000-0000-4000-8000-0000000000b1", "00000000-0000-4000-8000-0000000000b2"]);
    expect(DOCTOR_OMITTED_STATUSES).toEqual(["withdrawn"]);
  });
  it("a withdrawn row carrying text is dropped, never shown", () => {
    const r = parseDoctorReviewFeed([...good, { ...base, id: "00000000-0000-4000-8000-0000000000b4", status: "withdrawn", rating: 1, text: "Synthetic withdrawn text" }]);
    expect(r.ok && JSON.stringify(r.data)).not.toMatch(/withdrawn/);
  });
  it("any other unknown status, a non-array or an oversize feed still fails closed", () => {
    expect(parseDoctorReviewFeed([...good, { ...base, id: "00000000-0000-4000-8000-0000000000b5", status: "hidden_by_admin" }])).toEqual({ ok: false });
    expect(parseDoctorReviewFeed({ items: good })).toEqual({ ok: false });
    expect(parseDoctorReviewFeed(Array.from({ length: 501 }, () => good[1]))).toEqual({ ok: false });
    expect(parseDoctorReviewFeed([null])).toEqual({ ok: false });
  });
  it("the fixture seeds a withdrawn review and the doctor still gets the other four", async () => {
    expect(seedReviews(T0).some((r) => r.status === "withdrawn")).toBe(true);
    const r = await createDoctorReviewsFixtureApi({ env, actor: DEFAULT_DOCTOR_ACTOR, now: () => T0 }).listMine();
    expect(r.ok && r.data.map((x) => x.status).sort()).toEqual(["pending_moderation", "published", "published", "rejected"]);
  });
});

describe("D2: unpublished reviews are counts only", () => {
  it("the view lists published reviews only and counts the rest", async () => {
    const r = await createDoctorReviewsFixtureApi({ env, actor: DEFAULT_DOCTOR_ACTOR, now: () => T0 }).listMine();
    if (!r.ok) throw new Error("expected ok");
    const v = doctorReviewsView(r.data);
    expect(v.published.every((x) => x.status === "published")).toBe(true);
    expect(v.published).toHaveLength(2);
    expect({ pending: v.pending, rejected: v.rejected, average: v.average }).toEqual({ pending: 1, rejected: 1, average: 4.5 });
    // Nothing per-row (date, month, id) leaves the view for an unpublished review.
    const unpublishedIds = r.data.filter((x) => x.status !== "published").map((x) => x.id);
    expect(JSON.stringify(v)).not.toMatch(new RegExp(unpublishedIds.join("|")));
  });
  it("the page shows no submission date or visit month outside published cards", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/[locale]/doctor/reviews/page.tsx", "utf8");
    expect(page).toMatch(/v\.published\.map/);
    expect(page).not.toMatch(/card\.hidden|filters\.|r\.data\.map|status=/);
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
