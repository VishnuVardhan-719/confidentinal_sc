import { describe, expect, it } from "vitest";
import { createFixtureVerificationApi, createFixtureVerificationStore } from "@/modules/verification/fixture";
import { loadCoverage, loadReviewDetail, loadReviewQueue, runCoverageDecision, runReviewDecision, runStartReview } from "@/modules/verification/flows";
import { matchesExpiryWindow, parseCoverageFilter, parseReviewQueueFilter } from "@/modules/verification/queries";
import { createHttpVerificationApi } from "@/modules/verification/http";
import { FIXTURE_IDS } from "@/fixtures/identity";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const fresh = () => createFixtureVerificationApi({ env: DEV, store: createFixtureVerificationStore(), now: () => new Date("2026-11-18T00:00:00Z") });

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("filters", () => {
  it("keeps only valid filter values from the URL", () => {
    expect(parseReviewQueueFilter({ category: "lab", status: "under_review", expiry: "30d" })).toEqual({ category: "lab", status: "under_review", expiry: "30d" });
    expect(parseReviewQueueFilter({ category: "admin", status: "ACTIVE", expiry: "1y", extra: "x" })).toEqual({});
    expect(parseReviewQueueFilter({ category: ["lab", "doctor"] })).toEqual({});
    expect(parseReviewQueueFilter(new URLSearchParams("category=doctor"))).toEqual({ category: "doctor" });
    expect(parseCoverageFilter({ pin: "012345", state: "approved" })).toEqual({ state: "approved" });
  });

  it("expiry windows", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(matchesExpiryWindow("2026-12-01T00:00:00Z", "30d", now)).toBe(true);
    expect(matchesExpiryWindow("2027-01-30T00:00:00Z", "30d", now)).toBe(false);
    expect(matchesExpiryWindow("2027-01-30T00:00:00Z", "90d", now)).toBe(true);
    expect(matchesExpiryWindow("2026-11-01T00:00:00Z", "expired", now)).toBe(true);
    expect(matchesExpiryWindow(null, "expired", now)).toBe(false);
  });
});

describe("review loaders", () => {
  it("queue defaults to items needing action and applies filters", async () => {
    const api = fresh();
    const all = await loadReviewQueue(api, {});
    expect(all.result.kind === "ready" && all.result.data.map((q) => q.status)).toEqual(["under_review", "submitted"]);
    const labs = await loadReviewQueue(api, { category: "lab" });
    expect(labs.result.kind === "ready" && labs.result.data).toHaveLength(1);
    const suspended = await loadReviewQueue(api, { status: "suspended" });
    expect(suspended.result.kind === "ready" && suspended.result.data[0].category).toBe("caretaker");
  });

  it("detail lists permitted decisions; unknown id is not_found; http queue is gated", async () => {
    const detail = await loadReviewDetail(fresh(), FIXTURE_IDS.labProvider);
    expect(detail.kind === "ready" && detail.data.decisions).toEqual(["approve", "reject", "changes_required"]);
    expect(await loadReviewDetail(fresh(), "00000000-0000-4000-8000-0000000000ff")).toEqual({ kind: "not_found" });
    const http = createHttpVerificationApi({ fetch: async () => new Response("{}"), getAccessToken: () => "t" });
    expect((await loadReviewQueue(http, {})).result).toEqual({ kind: "gated" });
    expect((await loadCoverage(http, {})).result).toEqual({ kind: "gated" });
  });
});

describe("review decisions", () => {
  it("require explicit confirmation and a reason", async () => {
    const api = fresh();
    const base = { providerId: FIXTURE_IDS.labProvider, decision: "approve", reason: "Evidence checked", expectedVersion: "7" };
    expect(await runReviewDecision(api, form(base))).toMatchObject({ status: "invalid", errorKey: "admin.review.errors.confirmRequired" });
    expect(await runReviewDecision(api, form({ ...base, confirm: "on", reason: "  " }))).toMatchObject({ status: "invalid" });
    expect(await runReviewDecision(api, form({ ...base, confirm: "on", expectedVersion: "6" }))).toMatchObject({ status: "conflict" });
    expect(await runReviewDecision(api, form({ ...base, confirm: "on" }))).toEqual({ status: "done", resultStatus: "active", version: 8 });
  });

  it("start review then request changes", async () => {
    const api = fresh();
    const id = FIXTURE_IDS.doctorSubmittedProvider;
    expect(await runStartReview(api, form({ providerId: id, reason: "Starting", expectedVersion: "4" }))).toEqual({ status: "done", resultStatus: "under_review", version: 5 });
    expect(
      await runReviewDecision(api, form({ providerId: id, decision: "changes_required", reason: "Clearer registration copy needed", expectedVersion: "5", confirm: "on" })),
    ).toEqual({ status: "done", resultStatus: "changes_required", version: 6 });
  });

  it("http changes_required is gated, not faked", async () => {
    const http = createHttpVerificationApi({ fetch: async () => new Response("{}"), getAccessToken: () => "t" });
    const state = await runReviewDecision(http, form({ providerId: FIXTURE_IDS.labProvider, decision: "changes_required", reason: "r", expectedVersion: "7", confirm: "on" }));
    expect(state.status).toBe("gated");
  });
});

describe("coverage", () => {
  it("lists with permitted decisions and applies confirmed decisions", async () => {
    const api = fresh();
    const loaded = await loadCoverage(api, { state: "proposed" });
    if (loaded.result.kind !== "ready") throw new Error("ready");
    const [area] = loaded.result.data;
    expect(area.decisions).toEqual(["approve", "reject"]);
    const fd = { areaId: area.areaId, decision: "approve", reason: "PIN verified", expectedVersion: String(area.version) };
    expect(await runCoverageDecision(api, form(fd))).toMatchObject({ status: "invalid" });
    expect(await runCoverageDecision(api, form({ ...fd, confirm: "on" }))).toEqual({ status: "done", resultStatus: "approved", version: 2 });
    expect(await runCoverageDecision(api, form({ ...fd, confirm: "on", expectedVersion: "2" }))).toMatchObject({ status: "invalid" });
  });
});
