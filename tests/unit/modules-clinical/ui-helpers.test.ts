import { describe, expect, it } from "vitest";
import { badgeFor, parseRupeesToPaise, type Tk } from "@/components/clinical/kit";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { UNKNOWN_STATUS } from "@/modules/clinical/status-core";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { loadRequestDetail } from "@/modules/doctor/loaders";

// Synthetic data - not live.
const T0 = new Date("2026-11-20T04:30:00.000Z");
const tk: Tk = (key) => `t(${key})`;

describe("badgeFor: module tones -> StatusBadge tones", () => {
  it("maps progress to info with a clock icon (fe2-a has no progress tone)", () => {
    expect(badgeFor({ labelKey: "doctor.x.y", tone: "progress" }, tk)).toEqual({ tone: "info", label: "t(doctor.x.y)", icon: "clock" });
  });
  it("unknown status is neutral with a help icon, never success", () => {
    expect(badgeFor(UNKNOWN_STATUS, tk)).toEqual({ tone: "neutral", label: "t(clinical.status.unknown)", icon: "help" });
  });
  it("passes other tones through with the translated label", () => {
    for (const tone of ["info", "success", "warning", "danger"] as const) {
      expect(badgeFor({ labelKey: "clinical.a.b", tone }, tk)).toEqual({ tone, label: "t(clinical.a.b)" });
    }
  });
});

describe("parseRupeesToPaise (DC10 collection amount)", () => {
  it("converts rupees to integer paise without floating point", () => {
    expect(parseRupeesToPaise("800")).toBe(80000);
    expect(parseRupeesToPaise("800.5")).toBe(80050);
    expect(parseRupeesToPaise(" 800.50 ")).toBe(80050);
    expect(parseRupeesToPaise("0.29")).toBe(29);
    expect(parseRupeesToPaise("9999999.99")).toBe(999999999);
  });
  it("rejects zero, negatives, separators, extra decimals and junk", () => {
    for (const bad of ["0", "0.00", "-5", "1,000", "800.505", "1e3", "", ".5", "80000000", "₹800"]) {
      expect(parseRupeesToPaise(bad), bad).toBeNull();
    }
  });
});

describe("loadRequestDetail", () => {
  const api = (doctorId: string) => createDoctorFixtureApi({ world: createClinicalWorld(T0), actor: { role: "doctor", doctorId }, now: () => T0 });

  it("returns the request addressed to this doctor", async () => {
    const out = await loadRequestDetail(api(I.doctorAssigned), I.bookingRequest);
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") expect(out.data.bookingId).toBe(I.bookingRequest);
  });
  it("a malformed id is not_found without calling the API", async () => {
    let called = false;
    const spy = { ...api(I.doctorAssigned), listRequests: async () => { called = true; return { ok: true as const, data: [] }; } };
    expect(await loadRequestDetail(spy, "../etc")).toEqual({ kind: "not_found" });
    expect(called).toBe(false);
  });
  it("another doctor's request is not_found (no existence leak)", async () => {
    expect(await loadRequestDetail(api(I.doctorOther), I.bookingRequest)).toEqual({ kind: "not_found" });
  });
  it("API failure maps to a page state, not ready", async () => {
    const failing = { ...api(I.doctorAssigned), listRequests: async () => ({ ok: false as const, error: { code: "unavailable" as const } }) };
    expect((await loadRequestDetail(failing, I.bookingRequest)).kind).not.toBe("ready");
  });
});
