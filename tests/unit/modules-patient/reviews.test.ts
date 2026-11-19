import { describe, expect, it } from "vitest";
import { createReviewsFixtureApi, REVIEW_FIXTURE_IDS as I } from "@/modules/reviews/fixture";
import { createReviewsHttpApi } from "@/modules/reviews/http";
import { validateReviewInput } from "@/modules/reviews/schemas";
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
    expect(reviewEligibility({ bookingState: "completed", review: { id: "r", bookingId: "b", rating: 5, text: "ok", status: "published", submittedAt: "" } })).toBe("already_reviewed");
  });
  it("maps moderation states to labelled badges", () => {
    expect(describeReviewStatus("pending_moderation")).toMatchObject({ tone: "info", labelKey: "patientAccount.reviews.status.pending_moderation" });
    expect(describeReviewStatus("published").tone).toBe("success");
    expect(describeReviewStatus("rejected").tone).toBe("neutral");
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
