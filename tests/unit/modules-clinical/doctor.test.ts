import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { deriveChallengeView } from "@/modules/doctor/otp";
import { timelineReducer, type TimelineState, type VisitEvent } from "@/modules/doctor/timeline";
import { allowedVisitActions, splitTodayUpcoming } from "@/modules/doctor/visit";
import { describeBookingState } from "@/modules/doctor/status";

const T0 = new Date("2026-11-20T04:30:00.000Z");

function setup(opts: { doctorId?: string } = {}) {
  const world = createClinicalWorld(T0);
  let clock = T0;
  const codes: string[] = [];
  let next = 0;
  const api = createDoctorFixtureApi({
    world,
    actor: { role: "doctor", doctorId: opts.doctorId ?? I.doctorAssigned },
    now: () => clock,
    generateCode: () => ["111111", "222222", "333333"][next++ % 3],
    deliverToPatient: (_b, code) => codes.push(code),
  });
  return { world, api, codes, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

async function arriveAtToday(api: ReturnType<typeof setup>["api"]) {
  const v = await api.getVisit(I.bookingToday);
  if (!v.ok) throw new Error("setup");
  const e = await api.enRoute(I.bookingToday, { expectedVersion: v.data.version });
  if (!e.ok) throw new Error("setup");
  const a = await api.arrive(I.bookingToday, { expectedVersion: e.data.version });
  if (!a.ok) throw new Error("setup");
  const ch = await api.getArrivalChallenge(I.bookingToday);
  if (!ch.ok) throw new Error("setup");
  return ch.data;
}

describe("DC01 assigned doctor visit access", () => {
  it("other doctor is denied direct visit access even with a known booking ID", async () => {
    const { api } = setup({ doctorId: I.doctorOther });
    expect(await api.getVisit(I.bookingToday)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await api.enRoute(I.bookingToday, { expectedVersion: 3 })).toEqual({ ok: false, error: { code: "forbidden" } });
    const lists = await api.listVisits();
    expect(lists.ok && lists.data).toEqual([]);
  });

  it("pre-accept request exposes minimal fields only (no name, phone or exact address)", async () => {
    const { api } = setup();
    const r = await api.listRequests();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    const keys = Object.keys(r.data[0]);
    for (const k of ["patient", "contactPhone", "address", "consultationId"]) expect(keys).not.toContain(k);
    expect(r.data[0].area).toEqual({ locality: "Synthetic Nagar", pin: "500001" });
  });

  it("stale accept version is a conflict; actions derive from server state", async () => {
    const { api } = setup();
    expect(await api.accept(I.bookingRequest, { expectedVersion: 1, resourceIds: [I.resourceDoctor] })).toEqual({ ok: false, error: { code: "conflict" } });
    const ok = await api.accept(I.bookingRequest, { expectedVersion: 2, resourceIds: [I.resourceDoctor] });
    expect(ok).toEqual({ ok: true, data: { version: 3 } });
    expect(allowedVisitActions({ state: "confirmed", phase: "scheduled", consultationId: null })).toEqual(["en_route"]);
    expect(allowedVisitActions({ state: "cancelled", phase: "scheduled", consultationId: null })).toEqual([]);
  });

  it("splits today/upcoming by Asia/Kolkata day and drops terminal visits", async () => {
    const { api } = setup();
    const r = await api.listVisits();
    if (!r.ok) throw new Error("list");
    const { today, upcoming } = splitTodayUpcoming(r.data, T0);
    expect(today.map((v) => v.bookingId)).toEqual([I.bookingActive, I.bookingToday]);
    expect(upcoming.map((v) => v.bookingId)).toEqual([I.bookingUpcoming]);
  });

  it("unknown booking state never maps to an active/success tone", () => {
    expect(describeBookingState("totally_new_state")).toEqual({ labelKey: "clinical.status.unknown", tone: "neutral" });
  });
});

describe("DC02 arrival challenge and doctor OTP form", () => {
  it("challenge DTO never contains the code; server stores only a hash", async () => {
    const { api, world, codes } = setup();
    const ch = await arriveAtToday(api);
    expect(JSON.stringify(ch)).not.toContain(codes[0]);
    const stored = world.challenges.get(ch.challengeId);
    expect(JSON.stringify(stored)).not.toContain(codes[0]);
  });

  it("expired code is denied", async () => {
    const { api, codes, advance } = setup();
    const ch = await arriveAtToday(api);
    advance(5 * 60_000 + 1);
    expect(deriveChallengeView(ch, new Date(T0.getTime() + 5 * 60_000 + 1)).phase).toBe("expired");
    const r = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: codes[0] });
    expect(r.ok && r.data.result === "rejected" && r.data.reason).toBe("expired");
  });

  it("attempt limit locks the challenge, even for the right code afterwards", async () => {
    const { api, codes } = setup();
    const ch = await arriveAtToday(api);
    let last;
    for (let i = 0; i < ch.maxAttempts; i++) last = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: "999999" });
    expect(last?.ok && last.data.result === "rejected" && last.data.reason).toBe("attempts_exhausted");
    const after = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: codes[0] });
    expect(after.ok && after.data.result === "rejected" && after.data.reason).toBe("attempts_exhausted");
    if (after.ok && after.data.result === "rejected") expect(deriveChallengeView(after.data.challenge, T0).canSubmit).toBe(false);
  });

  it("replay of a used code is denied", async () => {
    const { api, codes } = setup();
    const ch = await arriveAtToday(api);
    const first = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: codes[0] });
    expect(first.ok && first.data.result).toBe("verified");
    const replay = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: codes[0] });
    expect(replay.ok && replay.data.result === "rejected" && replay.data.reason).toBe("replayed");
  });

  it("wrong doctor is denied", async () => {
    const s = setup();
    const ch = await arriveAtToday(s.api);
    const other = createDoctorFixtureApi({ world: s.world, actor: { role: "doctor", doctorId: I.doctorOther }, now: () => T0 });
    expect(await other.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: s.codes[0] })).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await other.getArrivalChallenge(I.bookingToday)).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("resend respects cooldown, supersedes the old code and is limited", async () => {
    const { api, codes, advance } = setup();
    const ch = await arriveAtToday(api);
    const early = await api.resendArrivalCode(I.bookingToday);
    expect(!early.ok && early.error.code).toBe("rate_limited");
    advance(30_000);
    const re = await api.resendArrivalCode(I.bookingToday);
    expect(re.ok).toBe(true);
    const old = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: codes[0] });
    expect(old.ok && old.data.result === "rejected" && old.data.reason).toBe("replayed");
    advance(30_000);
    expect((await api.resendArrivalCode(I.bookingToday)).ok).toBe(true);
    advance(30_000);
    expect((await api.resendArrivalCode(I.bookingToday)).ok).toBe(true);
    advance(30_000);
    const limited = await api.resendArrivalCode(I.bookingToday);
    expect(!limited.ok && limited.error.code).toBe("rate_limited");
  });

  it("malformed code is rejected before any server call; start needs verification first", async () => {
    const { api } = setup();
    const ch = await arriveAtToday(api);
    const bad = await api.verifyArrival(I.bookingToday, { challengeId: ch.challengeId, code: "12ab56" });
    expect(!bad.ok && bad.error.code).toBe("validation");
    const v = await api.getVisit(I.bookingToday);
    if (!v.ok) throw new Error("visit");
    expect(await api.startConsultation(I.bookingToday, { expectedVersion: v.data.version })).toEqual({ ok: false, error: { code: "conflict" } });
  });
});

describe("fixture consultation IDs (CR: tail collision)", () => {
  it("bookings sharing the last four characters get distinct consultations", async () => {
    const world = createClinicalWorld(T0);
    const a = "00000000-0000-4000-8000-00000000aaaa";
    const b = "11111111-0000-4000-8000-00000000aaaa";
    const src = world.bookings.get(I.bookingToday)!;
    for (const id of [a, b]) world.bookings.set(id, { ...src, bookingId: id, state: "confirmed", phase: "arrival_verified", consultationId: null, version: 5 });
    const api = createDoctorFixtureApi({ world, now: () => T0, actor: { role: "doctor", doctorId: I.doctorAssigned } });
    expect((await api.startConsultation(a, { expectedVersion: 5 })).ok).toBe(true);
    expect((await api.startConsultation(b, { expectedVersion: 5 })).ok).toBe(true);
    const ca = world.bookings.get(a)!.consultationId;
    const cb = world.bookings.get(b)!.consultationId;
    expect(ca).not.toBe(cb);
    expect(world.consultations.get(ca!)?.bookingId).toBe(a);
    expect(world.consultations.get(cb!)?.bookingId).toBe(b);
  });
});

describe("DC03 visit timeline freshness", () => {
  const base: TimelineState = { bookingId: "b1", version: 5, state: "confirmed", phase: "scheduled", events: [], lastUpdatedAt: T0.toISOString(), connection: "live", needsRefetch: false, observedVersion: 5 };
  const ev = (version: number, phase: VisitEvent["phase"], bookingId = "b1"): VisitEvent => ({ eventId: `e${version}`, bookingId, version, occurredAt: T0.toISOString(), state: "confirmed", phase });

  it("ignores stale, duplicate and other-booking events", () => {
    expect(timelineReducer(base, { type: "event", event: ev(5, "en_route") })).toBe(base);
    expect(timelineReducer(base, { type: "event", event: ev(4, "en_route") })).toBe(base);
    expect(timelineReducer(base, { type: "event", event: ev(6, "en_route", "b2") })).toBe(base);
  });

  it("out-of-order gap forces refetch instead of guessing", () => {
    const s = timelineReducer(base, { type: "event", event: ev(8, "arrived") });
    expect(s.needsRefetch).toBe(true);
    expect(s.phase).toBe("scheduled");
  });

  it("an older snapshot after reconnect does not clear recovery (CR: delayed snapshot)", () => {
    // Snapshot request captured v4; event 5 applied; socket drops and misses v6; reconnect.
    let s = timelineReducer({ ...base, version: 4, observedVersion: 4 }, { type: "event", event: ev(5, "en_route") });
    s = timelineReducer(timelineReducer(s, { type: "disconnected" }), { type: "reconnected" });
    expect(s.needsRefetch).toBe(true);
    const late = timelineReducer(s, { type: "snapshot", version: 4, state: "confirmed", phase: "scheduled", events: [], fetchedAt: T0.toISOString() });
    expect(late).toBe(s);
    expect(late.needsRefetch).toBe(true);
    expect(late.phase).toBe("en_route");
  });

  it("gap stays pending until a snapshot reaches the observed version (CR: gap cleared early)", () => {
    let s = timelineReducer({ ...base, version: 4, observedVersion: 4 }, { type: "event", event: ev(6, "arrived") });
    expect(s).toMatchObject({ needsRefetch: true, observedVersion: 6, version: 4 });
    s = timelineReducer(s, { type: "snapshot", version: 4, state: "confirmed", phase: "scheduled", events: [], fetchedAt: T0.toISOString() });
    expect(s.needsRefetch).toBe(true);
    s = timelineReducer(s, { type: "snapshot", version: 5, state: "confirmed", phase: "en_route", events: [ev(5, "en_route")], fetchedAt: T0.toISOString() });
    expect(s).toMatchObject({ version: 5, needsRefetch: true });
    s = timelineReducer(s, { type: "snapshot", version: 6, state: "confirmed", phase: "arrived", events: [ev(5, "en_route"), ev(6, "arrived")], fetchedAt: T0.toISOString() });
    expect(s).toMatchObject({ version: 6, phase: "arrived", needsRefetch: false });
  });

  it("reconnect requires refetch; snapshot restores authority", () => {
    let s = timelineReducer(base, { type: "disconnected" });
    expect(s.connection).toBe("disconnected");
    s = timelineReducer(s, { type: "reconnected" });
    expect(s.needsRefetch).toBe(true);
    s = timelineReducer(s, { type: "snapshot", version: 8, state: "confirmed", phase: "arrived", events: [ev(8, "arrived"), ev(6, "en_route")], fetchedAt: T0.toISOString() });
    expect(s).toMatchObject({ version: 8, phase: "arrived", needsRefetch: false });
    expect(s.events.map((e) => e.version)).toEqual([6, 8]);
  });
});
