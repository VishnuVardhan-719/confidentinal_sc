import { describe, expect, it } from "vitest";
import { FIXTURE_IDS } from "@/fixtures/identity";
import { ok } from "@/lib/api/result";
import type { OnboardingApi } from "@/modules/onboarding/api";
import { runSubmitProvider } from "@/modules/onboarding/flows";
import { fixtureSessionFor } from "@/modules/auth/fixture";
import { canAccessRoute, landingPathFor, pendingApprovalPath } from "@/modules/auth/routes";
import { createFixtureVerificationApi } from "@/modules/verification/fixture";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const labPath = (p: string) => `/en/lab/${p}`;

describe("provider approval gate", () => {
  it("a provider waiting for the admin sees the pending page, never a dashboard", () => {
    const lab = fixtureSessionFor("lab_pending_review");
    if (lab.kind !== "authenticated") throw new Error("fixture");
    expect(lab.identity.workspaces[0].state).toBe("pending_review");
    expect(landingPathFor(lab.identity, "en")).toBe(pendingApprovalPath("en", "lab"));
    expect(canAccessRoute(lab, labPath("dashboard"))).toMatchObject({ allowed: false, redirectTo: "/en/workspace/pending?role=lab" });
  });

  it("only gates doctor, lab, ambulance and caretaker; the path for other roles has no role", () => {
    expect(pendingApprovalPath("en", "patient")).toBe("/en/workspace/pending");
    expect(pendingApprovalPath("en", "admin")).toBe("/en/workspace/pending");
    expect(pendingApprovalPath("hi", "caretaker")).toBe("/hi/workspace/pending?role=caretaker");
  });

  it("a successful submit sends the provider to the pending page", async () => {
    const api = { submitProvider: async (providerId: string) => ok({ providerId, status: "submitted", version: 4 }) } as unknown as OnboardingApi;
    const submit = await runSubmitProvider(api, { category: "ambulance", providerId: FIXTURE_IDS.ambulanceProvider, expectedVersion: 3 }, "te");
    expect(submit).toEqual({ status: "redirect", to: "/te/workspace/pending?role=ambulance" });
  });

  it("admin approval opens the dashboard on the next sign-in", async () => {
    const verification = createFixtureVerificationApi({ env: DEV, now: () => new Date("2026-11-18T00:00:00Z") });
    const detail = await verification.getProviderForReview(FIXTURE_IDS.labProvider);
    if (!detail.ok) throw new Error("fixture lab missing");
    const decided = await verification.submitDecision(FIXTURE_IDS.labProvider, {
      decision: "approve",
      reason: "Documents verified.",
      expectedVersion: detail.data.version,
    });
    expect(decided.ok).toBe(true);
    const lab = fixtureSessionFor("lab_pending_review");
    if (lab.kind !== "authenticated") throw new Error("fixture");
    expect(lab.identity.workspaces[0]).toMatchObject({ state: "active", providerStatus: "active" });
    expect(canAccessRoute(lab, labPath("dashboard")).allowed).toBe(true);
    expect(landingPathFor(lab.identity, "en")).toBe("/en/lab/dashboard");
  });
});
