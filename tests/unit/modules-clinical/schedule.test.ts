import { describe, expect, it } from "vitest";
import { buildSchedule, istDayKey } from "@/modules/doctor/schedule";
import type { AssignedVisitView } from "@/modules/doctor/types";

const v = (id: string, at: string, state: AssignedVisitView["state"] = "accepted") => ({ id, scheduledStartAt: at, state });

describe("doctor schedule (IST days)", () => {
  // 2026-11-19 20:00 UTC = 2026-11-20 01:30 IST, so "today" in IST is the 20th.
  const now = new Date("2026-11-19T20:00:00Z");

  it("uses the IST calendar date, not UTC", () => {
    expect(istDayKey(now)).toBe("2026-11-20");
    expect(buildSchedule([], now)[0].dayKey).toBe("2026-11-20");
  });

  it("returns 7 consecutive days including empty ones", () => {
    const days = buildSchedule([], now);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    expect(days.every((d) => d.visits.length === 0)).toBe(true);
  });

  it("places visits on their IST day in start order and skips requests, closed and out-of-window bookings", () => {
    const days = buildSchedule(
      [
        v("late", "2026-11-21T12:00:00Z"),
        v("early", "2026-11-20T19:00:00Z"), // 00:30 IST on the 21st
        v("req", "2026-11-21T05:00:00Z", "requested"),
        v("done", "2026-11-21T05:00:00Z", "completed"),
        v("far", "2026-12-10T05:00:00Z"),
        v("bad", "not-a-date"),
        v("live", "2026-11-20T03:00:00Z", "in_progress"),
      ],
      now,
    );
    expect(days[0].visits.map((x) => x.id)).toEqual(["live"]);
    expect(days[1].visits.map((x) => x.id)).toEqual(["early", "late"]);
    expect(days.flatMap((d) => d.visits).map((x) => x.id)).not.toContain("req");
  });
});
