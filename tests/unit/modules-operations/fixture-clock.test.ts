import { describe, expect, it } from "vitest";
import { labActors } from "@/fixtures/operations/lab";
import { OPS_FIXTURE_EPOCH, operationsNow } from "@/modules/admin/clock";
import { createLabFixtureApi } from "@/modules/lab/fixture";
import { labRecollectionAction } from "@/modules/lab/server-actions";

const FIXTURE = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const pinned = Date.parse(OPS_FIXTURE_EPOCH);

describe("operations fixture clock", () => {
  it("starts at the fixture epoch in fixture mode and then runs forward", () => {
    const now = operationsNow(FIXTURE).getTime();
    expect(now).toBeGreaterThanOrEqual(pinned);
    expect(now - pinned).toBeLessThan(60 * 60_000);
  });

  it("honours FIXTURE_NOW and ignores an unparseable value", () => {
    const at = operationsNow({ ...FIXTURE, FIXTURE_NOW: "2026-12-01T00:00:00Z" }).getTime();
    expect(at).toBeGreaterThanOrEqual(Date.parse("2026-12-01T00:00:00Z"));
    expect(operationsNow({ ...FIXTURE, FIXTURE_NOW: "not a date" }).getTime()).toBeGreaterThanOrEqual(pinned);
  });

  it("uses the real clock for the http adapter", () => {
    const before = Date.now();
    const at = operationsNow({ FRONTEND_ADAPTER: "http", FIXTURE_NOW: "2026-12-01T00:00:00Z" }).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("refuses fixture mode in production", () => {
    expect(() => operationsNow({ FRONTEND_ADAPTER: "fixture", APP_ENV: "production" })).toThrow();
  });
});

describe("lab order queues", () => {
  it("lists a scheduled collection on another day under 'scheduled' but not 'today'", async () => {
    const api = createLabFixtureApi({ env: FIXTURE, actor: labActors.manager, now: () => new Date("2026-11-18T06:00:00Z") });
    const refs = async (queue: "today" | "scheduled") => {
      const r = await api.listOrders({ queue });
      return r.ok ? r.data.items.map((o) => o.reference) : null;
    };
    expect(await refs("today")).toEqual([]);
    expect(await refs("scheduled")).toEqual(["#SCV-BKG-900102"]);
  });
});

describe("lab recollection action", () => {
  it("rejects malformed input without calling the server", async () => {
    expect(await labRecollectionAction({ orderId: "" }, { idempotencyKey: "k" })).toEqual({ ok: false, code: "validation" });
  });
});
