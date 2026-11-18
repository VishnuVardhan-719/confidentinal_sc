import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { createPatientBookingLoaders } from "@/modules/bookings/server-loaders";
import { groupPatientBookings } from "@/modules/bookings/view-model";
import { bookingFromReview, reviewedFixture, testId } from "./phase2-fixtures";
const now = "2026-11-18T00:00:00Z";
const booking = bookingFromReview(reviewedFixture());
const other = "00000000-0000-4000-8000-000000000009";
function setup() {
  const api = { list: vi.fn().mockResolvedValue(ok({ items: [] })), get: vi.fn().mockResolvedValue(ok(booking)), timeline: vi.fn().mockResolvedValue(ok({ items: [] })) };
  return { api, loaders: createPatientBookingLoaders({ api, authorizePatient: async () => ok(null) }) };
}

describe("patient loader branch boundaries", () => {
  it("sanitizes failed authorization before private access", async () => {
    const { api } = setup();
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => { throw new Error("private session detail"); } });
    expect(await loaders.list("en", now)).toEqual(fail("unavailable"));
    expect(await loaders.detail(testId, "en")).toEqual(fail("unavailable"));
    expect(api.list).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
  });
  it("rejects bad dates, pagination and IDs after authorization but before network", async () => {
    const { api, loaders } = setup();
    expect(await loaders.list("en", "invalid")).toEqual(fail("validation"));
    expect(await loaders.list("en", now, { limit: 51 })).toEqual(fail("validation"));
    expect(await loaders.list("en", now, { cursor: "bad" })).toEqual(fail("validation"));
    expect(await loaders.detail("bad", "en")).toEqual(fail("validation"));
    expect(api.list).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
  });
  it("distinguishes an empty complete list from unavailable or denied list data", async () => {
    const { api, loaders } = setup();
    const empty = await loaders.list("en", now);
    expect(empty.ok && empty.data).toEqual(expect.objectContaining({ complete: true, hasMore: false, nextCursor: null, nextVisitState: "empty", nextVisit: null }));
    api.list.mockResolvedValueOnce(fail("forbidden"));
    expect(await loaders.list("en", now)).toEqual(fail("forbidden"));
    api.list.mockResolvedValueOnce(ok({ items: [{ ...booking, status: "future_state" }] }));
    expect(await loaders.list("en", now)).toEqual(fail("unavailable"));
    api.list.mockRejectedValueOnce(new Error("private"));
    expect(await loaders.list("en", now)).toEqual(fail("unavailable"));
  });
  it("returns next visit only when the full first page is known and preserves cursor scope", async () => {
    const { api, loaders } = setup(); api.list.mockResolvedValue(ok({ items: [booking] }));
    const complete = await loaders.list("te", now);
    expect(complete.ok && complete.data.nextVisit?.id).toBe(booking.id);
    expect(complete.ok && complete.data.nextVisitState).toBe("available");
    const cursorPage = await loaders.list("en", now, { cursor: other, limit: 5 });
    expect(cursorPage.ok && cursorPage.data).toEqual(expect.objectContaining({ scope: "loaded_page", complete: false, hasMore: false, nextVisit: null, nextVisitState: "incomplete" }));
    expect(api.list).toHaveBeenLastCalledWith({ cursor: other, limit: 5 });
    const full = await loaders.list("en", now, { limit: 1 });
    expect(full.ok && full.data.nextCursor).toBe(booking.id);
  });
  it("does not request auxiliary panels when booking access is rejected", async () => {
    const { api, loaders } = setup(); api.get.mockResolvedValueOnce(fail("forbidden"));
    expect(await loaders.detail(testId, "en")).toEqual(fail("forbidden"));
    api.get.mockRejectedValueOnce(new Error("private"));
    expect(await loaders.detail(testId, "en")).toEqual(fail("unavailable"));
    expect(api.timeline).not.toHaveBeenCalled();
  });
  it.each([
    { id: testId, bookingId: other, status: "REQUESTED", version: 2, occurredAt: now, actorRole: "patient", synthetic: true },
    { id: testId, bookingId: testId, status: "bad", version: 2, occurredAt: now, actorRole: "patient", synthetic: true },
  ])("rejects invalid or other-booking timeline data: %j", async event => {
    const { api, loaders } = setup(); api.timeline.mockResolvedValue(ok({ items: [event] }));
    const result = await loaders.detail(testId, "en");
    expect(result.ok && result.data.timeline).toEqual(fail("unavailable"));
  });
  it("strips extra timeline fields while preserving authorized event order", async () => {
    const { api, loaders } = setup();
    api.timeline.mockResolvedValue(ok({ items: [{ id: testId, bookingId: testId, status: "REQUESTED", version: 2, occurredAt: now, actorRole: "patient", synthetic: true, privateContact: "private" }] }));
    const result = await loaders.detail(testId, "en");
    expect(result.ok && result.data.timeline.ok).toBe(true);
    expect(result.ok && result.data.timeline.ok && result.data.timeline.data.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("privateContact");
  });
  it("keeps timeline and payment failures separate from valid booking data", async () => {
    const { api } = setup(); api.timeline.mockRejectedValue(new Error("private"));
    const getSummary = vi.fn().mockResolvedValueOnce(ok({ bookingId: testId, status: "PAID" })).mockRejectedValueOnce(new Error("private payment"));
    const loaders = createPatientBookingLoaders({ api, authorizePatient: async () => ok(null), payments: { getSummary } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await loaders.detail(testId, "en");
      expect(result.ok && result.data.booking.id).toBe(testId);
      expect(result.ok && result.data.timeline).toEqual(fail("unavailable"));
      expect(result.ok && result.data.payment).toEqual(fail("unavailable"));
    }
  });
});

describe("patient view grouping boundaries", () => {
  it("uses UTC ordering and keeps terminal future bookings out of upcoming", () => {
    const earlier = { ...booking, id: other, startAt: "2026-11-19T04:30:00.000Z", endAt: "2026-11-19T05:30:00.000Z" };
    const past = { ...booking, id: "00000000-0000-4000-8000-000000000008", startAt: "2026-11-17T04:30:00.000Z", endAt: "2026-11-17T05:30:00.000Z" };
    const completed = { ...booking, status: "COMPLETED" as const };
    const declined = { ...earlier, status: "DECLINED" as const };
    const groups = groupPatientBookings([booking, completed, earlier, declined, past], now);
    expect(groups.upcoming.map(item => item.id)).toEqual([other, testId]);
    expect(groups.past.map(item => item.id)).toEqual([testId, past.id]);
    expect(groups.cancelled).toEqual([declined]);
  });
});
