import { afterEach, describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I, istDayKey, onIstDayOf, sharedClinicalWorld, shiftTimestamps } from "@/fixtures/clinical/world";

const WORLD = Symbol.for("scv.fixtures.clinicalWorld");
const ANCHOR = Symbol.for("scv.fixtures.clinicalWorldDay");
const reset = () => {
  const g = globalThis as unknown as Record<symbol, unknown>;
  delete g[WORLD];
  delete g[ANCHOR];
};
afterEach(reset);

const day = (w: ReturnType<typeof createClinicalWorld>, id: string) => istDayKey(new Date(w.bookings.get(id)!.scheduledStartAt));

describe("fixture 'today' visits stay on the IST day of now", () => {
  for (const at of ["2026-11-19T18:25:00Z" /* 23:55 IST */, "2026-11-19T18:31:00Z" /* 00:01 IST next day */, "2026-11-19T06:30:00Z" /* noon IST */]) {
    it(`created at ${at}`, () => {
      const now = new Date(at);
      const w = createClinicalWorld(now);
      expect(day(w, I.bookingToday)).toBe(istDayKey(now));
      expect(day(w, I.bookingActive)).toBe(istDayKey(now));
      expect(day(w, I.bookingUpcoming) > istDayKey(now)).toBe(true);
    });
  }

  it("onIstDayOf keeps offsets inside the day and leaves mid-day times exact", () => {
    const noon = new Date("2026-11-19T06:30:00Z");
    expect(onIstDayOf(noon, 30).toISOString()).toBe("2026-11-19T07:00:00.000Z");
    expect(istDayKey(onIstDayOf(new Date("2026-11-19T18:25:00Z"), 30))).toBe("2026-11-19");
  });
});

describe("shared world rolls with the calendar day", () => {
  it("a server started yesterday still shows today's visits today, keeping mutations", () => {
    reset();
    const start = new Date("2026-11-19T17:00:00Z"); // 22:30 IST
    const w = sharedClinicalWorld(start);
    w.proofs.set("p1", { token: "p1", bookingId: I.bookingActive, issuedAt: start.toISOString(), expiresAt: new Date(start.getTime() + 3_600_000).toISOString(), revokedAt: null });
    const later = new Date("2026-11-19T19:30:00Z"); // 01:00 IST next day
    const same = sharedClinicalWorld(later);
    expect(same).toBe(w);
    expect(day(same, I.bookingToday)).toBe(istDayKey(later));
    expect(day(same, I.bookingActive)).toBe(istDayKey(later));
    const p = same.proofs.get("p1")!;
    expect(Date.parse(p.expiresAt) - Date.parse(p.issuedAt)).toBe(3_600_000);
    expect(p.token).toBe("p1");
  });

  it("no shift within the same day", () => {
    reset();
    const a = sharedClinicalWorld(new Date("2026-11-19T06:30:00Z"));
    const before = a.bookings.get(I.bookingToday)!.scheduledStartAt;
    sharedClinicalWorld(new Date("2026-11-19T12:00:00Z"));
    expect(a.bookings.get(I.bookingToday)!.scheduledStartAt).toBe(before);
  });

  it("shiftTimestamps only moves ISO timestamps", () => {
    const v = { at: "2026-11-19T10:00:00.000Z", id: "2026-ref", n: 3, list: ["2026-11-19T10:00:00+05:30", "text"] };
    expect(shiftTimestamps(v, 86_400_000)).toEqual({ at: "2026-11-20T10:00:00.000Z", id: "2026-ref", n: 3, list: ["2026-11-20T04:30:00.000Z", "text"] });
  });
});
