import { describe, expect, it } from "vitest";
import { createFixtureOnboardingApi, createFixtureOnboardingStore } from "@/modules/onboarding/fixture";
import type { OnboardingApi } from "@/modules/onboarding/api";
import { checkProfileGate, decideProfileGate, profileFixPath } from "@/modules/onboarding/profile-gate";
import { PROFILE_ITEM_TOTAL } from "@/modules/onboarding/profile";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const NOW = new Date("2026-06-01T00:00:00Z");
const apiFor = (seed: "new" | "complete" | "empty") =>
  createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore({ actor: seed }), actorId: "actor" });

describe("profile gate (USER-REQ-1 D, 13 items)", () => {
  it("passes a complete profile", async () => {
    const gate = await checkProfileGate(apiFor("complete"), "en", NOW);
    expect(gate.kind).toBe("complete");
    if (gate.kind === "complete") expect(gate.completeness.completed).toBe(13);
  });

  it("refuses an incomplete profile with the missing items and a PHI-free fix path", async () => {
    const gate = await checkProfileGate(apiFor("new"), "te", NOW);
    expect(gate).toMatchObject({ kind: "incomplete", total: 13, fixPath: "/te/patient/onboarding" });
    if (gate.kind !== "incomplete") throw new Error("expected incomplete");
    expect(gate.completed).toBe(6);
    expect(gate.missing).toHaveLength(PROFILE_ITEM_TOTAL - gate.completed);
    expect(gate.missing).toContain("gender");
  });

  it("refuses an empty profile with all 13 items missing", async () => {
    const gate = await checkProfileGate(apiFor("empty"), "en", NOW);
    expect(gate.kind).toBe("incomplete");
    if (gate.kind === "incomplete") expect(gate.missing).toHaveLength(13);
  });

  it("fails closed when the profile cannot be loaded", async () => {
    const failing = (code: string) =>
      ({ getPatientDraft: async () => ({ ok: false, error: { code, message: "x" } }) }) as unknown as OnboardingApi;
    expect((await checkProfileGate(failing("gated"), "en", NOW)).kind).toBe("gated");
    expect((await checkProfileGate(failing("forbidden"), "en", NOW)).kind).toBe("forbidden");
    expect((await checkProfileGate(failing("network"), "en", NOW)).kind).toBe("error");
  });

  it("never passes a ready page whose completeness still lists missing items", () => {
    const gate = decideProfileGate(
      {
        kind: "ready",
        completeness: { items: [], completed: 12, total: 13, missing: ["surgeries"], readyToBook: true },
      } as never,
      "en",
    );
    expect(gate).toMatchObject({ kind: "incomplete", missing: ["surgeries"] });
    expect(profileFixPath("hi")).toBe("/hi/patient/onboarding");
  });
});
