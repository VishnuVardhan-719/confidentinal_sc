import { describe, expect, it } from "vitest";
import { can } from "@/modules/admin/capabilities";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { createReviewModerationFixtureApi, createReviewsFixtureApi, REVIEW_FIXTURE_IDS as I } from "@/modules/reviews/fixture";
import { createReviewModerationHttpApi, createReviewsHttpApi } from "@/modules/reviews/http";
import { parseModerationFilter, validateReviewInput } from "@/modules/reviews/schemas";
import { describeReviewStatus, reviewEligibility } from "@/modules/reviews/status";

const ENV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const good = { rating: 4, text: "  Arrived on time and explained everything clearly.  " };
let n = 0;
const owner = () => `reviews-owner-${Date.now()}-${n++}`;

describe("review validation", () => {
  it("accepts 1-5 stars and trims text", () => {
    expect(validateReviewInput(good)).toEqual({ ok: true, data: { rating: 4, text: "Arrived on time and explained everything clearly." } });
    expect(validateReviewInput({ rating: 1, text: "సమయానికి వచ్చారు, బాగా చూసుకున్నారు." }).ok).toBe(true);
  });

  it("returns one stable code per field", () => {
    const code = (input: object) => { const r = validateReviewInput(input); return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`); };
    expect(code({ text: "" })).toEqual(["rating:rating_required", "text:text_too_short"]);
    expect(code({ rating: 0, text: good.text })).toEqual(["rating:rating_required"]);
    expect(code({ rating: 6, text: good.text })).toEqual(["rating:rating_required"]);
    expect(code({ rating: 4.5, text: good.text })).toEqual(["rating:rating_required"]);
    expect(code({ rating: "5", text: good.text })).toEqual(["rating:rating_required"]);
    expect(code({ rating: 3, text: "short" })).toEqual(["text:text_too_short"]);
    expect(code({ rating: 3, text: "x".repeat(1001) })).toEqual(["text:text_too_long"]);
    expect(code({ rating: 3, text: "Call me on 98765 43210 anytime please" })).toEqual(["text:text_contact"]);
    expect(code({ rating: 3, text: "See https://example.invalid for more" })).toEqual(["text:text_contact"]);
    expect(code({ rating: 3, text: "Mail me at someone@example.invalid ok" })).toEqual(["text:text_contact"]);
    expect(code({ ...good, bookingId: "x" })).not.toEqual([]);
  });
});

describe("review eligibility and status", () => {
  it("allows only completed, not-yet-reviewed bookings", () => {
    expect(reviewEligibility({ bookingState: "completed", review: null })).toBe("can_review");
    expect(reviewEligibility({ bookingState: "other", review: null })).toBe("not_completed");
    expect(reviewEligibility({ bookingState: "completed", review: { id: "r", bookingId: "b", rating: 5, text: "ok", status: "published", submittedAt: "", rejectionReason: null, version: 1 } })).toBe("already_reviewed");
  });
  it("maps moderation states to labelled badges", () => {
    expect(describeReviewStatus("pending_moderation")).toMatchObject({ tone: "info", labelKey: "patientAccount.reviews.status.pending_moderation" });
    expect(describeReviewStatus("published").tone).toBe("success");
    expect(describeReviewStatus("rejected").tone).toBe("warning");
    expect(describeReviewStatus("withdrawn").labelKey).toBe("patientAccount.reviews.status.withdrawn");
  });
});

describe("reviews fixture adapter", () => {
  it("refuses signed-out callers", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: null });
    expect(await api.listVisits()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });

  it("submits once as pending moderation; retries are idempotent; a second review conflicts", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    const first = await api.submit(I.doctorDue, good, "key-11111111");
    expect(first).toMatchObject({ ok: true, data: { bookingId: I.doctorDue, rating: 4, status: "pending_moderation" } });
    const retry = await api.submit(I.doctorDue, good, "key-11111111");
    expect(retry.ok && first.ok && retry.data.id === first.data.id).toBe(true);
    expect(await api.submit(I.doctorDue, good, "key-22222222")).toMatchObject({ ok: false, error: { code: "conflict" } });
    const visit = await api.getVisit(I.doctorDue);
    expect(visit.ok && visit.data.review?.status).toBe("pending_moderation");
  });

  it("refuses non-completed, reviewed, unknown and malformed bookings", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    expect(await api.submit(I.upcoming, good, "key-33333333")).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await api.submit(I.published, good, "key-44444444")).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.submit("00000000-0000-4000-8000-0000000002ff", good, "key-55555555")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await api.submit("nope", good, "key-66666666")).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await api.getVisit("nope")).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns field codes for invalid input", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    expect(await api.submit(I.labDue, { rating: 9, text: "hi" }, "key-77777777")).toEqual({ ok: false, error: { code: "validation", fields: { rating: "rating_required", text: "text_too_short" } } });
  });

  it("starts empty in the empty scenario and is refused in production", async () => {
    const empty = await createReviewsFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" }).listVisits();
    expect(empty.ok && empty.data).toEqual([]);
    expect(() => createReviewsFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "production" }, ownerId: "x" })).toThrow();
  });
});

describe("reviews http adapter", () => {
  it("fails closed as gated", async () => {
    const api = createReviewsHttpApi();
    for (const r of [await api.listVisits(), await api.getVisit(I.doctorDue), await api.submit(I.doctorDue, good, "key-12345678")]) expect(r).toEqual({ ok: false, error: { code: "gated" } });
  });
});

describe("review edit and withdraw", () => {
  it("edit sends the review back to moderation, version-checked; rejected reviews can be fixed", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    const before = await api.getVisit(I.rejected);
    expect(before.ok && before.data.review).toMatchObject({ status: "rejected", rejectionReason: "not_about_service", version: 1 });
    expect(await api.edit(I.rejected, good, 7)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.edit(I.rejected, { rating: 4, text: "x" }, 1)).toMatchObject({ ok: false, error: { code: "validation", fields: { text: "text_too_short" } } });
    const edited = await api.edit(I.rejected, good, 1);
    expect(edited).toMatchObject({ ok: true, data: { status: "pending_moderation", rejectionReason: null, version: 2, rating: 4 } });
    const published = await api.edit(I.published, good, 1);
    expect(published.ok && published.data.status).toBe("pending_moderation");
  });

  it("withdraw is final: no edit, no second withdraw, no new review", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    const w = await api.withdraw(I.pending, 1);
    expect(w).toMatchObject({ ok: true, data: { status: "withdrawn", version: 2 } });
    expect(await api.withdraw(I.pending, 2)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.edit(I.pending, good, 2)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.submit(I.pending, good, "key-99999999")).toMatchObject({ ok: false, error: { code: "conflict" } });
    const v = await api.getVisit(I.pending);
    expect(v.ok && reviewEligibility(v.data)).toBe("already_reviewed");
  });

  it("refuses edits to unknown, unreviewed and malformed bookings", async () => {
    const api = createReviewsFixtureApi({ env: ENV, ownerId: owner() });
    expect(await api.edit(I.doctorDue, good, 1)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await api.withdraw("nope", 1)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await api.withdraw(I.pending, 0)).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});

describe("review moderation fixture", () => {
  it("refuses non-moderators", async () => {
    const api = createReviewModerationFixtureApi({ env: ENV, moderator: false });
    expect(await api.listQueue("pending_moderation")).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("lists the pending queue oldest first with no patient identity", async () => {
    const api = createReviewModerationFixtureApi({ env: ENV, moderator: true });
    const q = await api.listQueue("pending_moderation");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const refs = q.data.map((i) => i.bookingReference);
    expect(refs).toEqual(expect.arrayContaining(["SYN-BKG-0301", "SYN-BKG-0302", "SYN-BKG-0303"]));
    expect([...q.data].map((i) => i.submittedAt)).toEqual([...q.data].map((i) => i.submittedAt).sort());
    for (const i of q.data) expect(Object.keys(i).sort()).toEqual(["bookingReference", "category", "providerDisplayName", "rating", "rejectionReason", "reviewId", "status", "submittedAt", "text", "version"]);
  });

  it("publishes or rejects with a reason once; stale or repeated decisions conflict", async () => {
    const api = createReviewModerationFixtureApi({ env: ENV, moderator: true });
    const q = await api.listQueue("pending_moderation");
    if (!q.ok) throw new Error("queue");
    const [a, b] = q.data.filter((i) => i.bookingReference.startsWith("SYN-BKG-030"));
    expect(await api.decide(a.reviewId, { decision: "reject" }, a.version)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await api.decide(a.reviewId, { decision: "publish" }, a.version + 5)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.decide(a.reviewId, { decision: "publish" }, a.version)).toMatchObject({ ok: true, data: { status: "published" } });
    expect(await api.decide(a.reviewId, { decision: "publish" }, a.version + 1)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.decide(b.reviewId, { decision: "reject", reason: "spam" }, b.version)).toMatchObject({ ok: true, data: { status: "rejected", rejectionReason: "spam" } });
    const rejected = await api.listQueue("rejected");
    expect(rejected.ok && rejected.data.some((i) => i.reviewId === b.reviewId)).toBe(true);
    expect(await api.decide("not-a-uuid", { decision: "publish" }, 1)).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it("parses the queue filter and fails closed over http", async () => {
    expect(parseModerationFilter("published")).toBe("published");
    expect(parseModerationFilter("withdrawn")).toBe("pending_moderation");
    expect(parseModerationFilter(["published"])).toBe("pending_moderation");
    const http = createReviewModerationHttpApi();
    expect(await http.listQueue("pending_moderation")).toEqual({ ok: false, error: { code: "gated" } });
    expect(await http.decide("x", {}, 1)).toEqual({ ok: false, error: { code: "gated" } });
  });

  it("in the integrated fixture world only the synthetic admin lead holds review:moderate (real admin sign-in, no env switch)", () => {
    expect(can(adminPrincipals.superAdmin, "review:moderate")).toBe(true);
    for (const p of [adminPrincipals.verifier, adminPrincipals.contentPublisher, adminPrincipals.contentEditor, adminPrincipals.noGrants]) {
      expect(can(p, "review:moderate")).toBe(false);
    }
    expect(can(adminPrincipals.noMfa, "review:moderate")).toBe(false);
  });
});
