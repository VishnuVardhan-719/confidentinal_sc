import { describe, expect, it } from "vitest";
import { createFixtureAuthApi, fixtureSessionFor } from "@/modules/auth/fixture";
import { createFixtureOnboardingApi } from "@/modules/onboarding/fixture";
import { createFixtureVerificationApi } from "@/modules/verification/fixture";
import { workspaceStateFor, landingPathFor } from "@/modules/auth/routes";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const stateOf = (scenario: "doctor_new" | "lab_new") => {
  const s = fixtureSessionFor(scenario);
  if (s.kind !== "authenticated") throw new Error("expected a session");
  return { identity: s.identity, state: workspaceStateFor(s.identity, scenario === "doctor_new" ? "doctor" : "lab") };
};

describe("a provider's own signup identity", () => {
  it("email signup as a doctor or lab never creates a patient identity", async () => {
    const auth = createFixtureAuthApi({ env });
    await auth.signup({ method: "email_password", role: "doctor", email: "own.doctor@example.invalid", password: "a-long-enough-password", acceptedTerms: true, termsVersion: "2026-11" } as never);
    const login = await auth.login({ method: "email_password", email: "own.doctor@example.invalid", password: "x" });
    expect(login.ok && login.data.kind === "signed_in" ? login.data.session.accessToken : "").toBe("fixture-session.doctor_new");
    const { identity } = stateOf("doctor_new");
    expect(identity.workspaces.map((w) => w.role)).toEqual(["doctor"]);
    expect(landingPathFor(identity)).toBe("/en/doctor/onboarding");
  });

  it("a submitted application waits for the admin, shows in their queue, and opens only after approval", async () => {
    const onboarding = createFixtureOnboardingApi({ env });
    const verification = createFixtureVerificationApi({ env });
    const created = await onboarding.createProvider({ category: "doctor", displayName: "Dr New Applicant", description: "" } as never);
    if (!created.ok) throw new Error("create failed");
    const id = created.data.providerId;
    expect(stateOf("doctor_new").state).toBe("onboarding_incomplete");

    const draft = (v: number) => v;
    let version = draft(1);
    const save = async (section: string, value: unknown) => {
      const r = await onboarding.saveProviderSection(id, "doctor", section as never, value as never, version);
      if (!r.ok) throw new Error(`${section}: ${JSON.stringify(r.error)}`);
      version = r.data.version;
    };
    await save("identity", {
      registrationNumber: "SYN-12345", issuingAuthority: "Synthetic Medical Council", qualifications: [{ degree: "MBBS" }],
      specialty: "General medicine", experienceYears: 5, languages: ["en", "te"], city: "Synthetic City", photoAssetId: ID(1),
    });
    await save("practice", {
      homeVisitFeePaise: 80_000, servicePins: ["500001"], travelRadiusKm: 10,
      startingPoint: { pinCode: "500001", locality: "Synthetic locality" },
    });
    await save("availability", { weeklyHours: [{ day: "mon", opens: "09:00", closes: "13:00" }] });
    const doc = await onboarding.registerProviderDocument(id, {
      kind: "registration", contentType: "application/pdf", expiresAt: "2099-01-01T00:00:00Z", expectedVersion: version,
    } as never);
    if (!doc.ok) throw new Error(`doc: ${JSON.stringify(doc.error)}`);
    const submitted = await onboarding.submitProvider(id, doc.data.providerVersion);
    expect(submitted.ok).toBe(true);

    expect(stateOf("doctor_new").state).toBe("pending_review");
    const queue = await verification.listReviewQueue({});
    expect(queue.ok && queue.data.some((q) => q.providerId === id && q.displayName === "Dr New Applicant")).toBe(true);

    const detail = await verification.getProviderForReview(id);
    if (!detail.ok) throw new Error("no review record");
    const started = await verification.startReview(id, { reason: "Synthetic check started", expectedVersion: detail.data.version } as never);
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const approved = await verification.submitDecision(id, { decision: "approve", reason: "Synthetic evidence checked", expectedVersion: started.data.version } as never);
    expect(approved.ok).toBe(true);
    expect(stateOf("doctor_new").state).toBe("active");
  });

  it("a new signup starts with no application", async () => {
    const auth = createFixtureAuthApi({ env });
    await auth.signup({ method: "email_password", role: "lab", email: "fresh.lab@example.invalid", password: "a-long-enough-password", acceptedTerms: true, termsVersion: "2026-11" } as never);
    expect(stateOf("lab_new").state).toBe("onboarding_incomplete");
  });
});

describe("a new patient", () => {
  it("is active after finishing the questionnaire, so booking no longer bounces back to the details form", async () => {
    const { FIXTURE_IDS, FIXTURE_PATIENT_DRAFT_COMPLETE } = await import("@/fixtures/identity");
    const { questionnaireFromDraft } = await import("@/modules/onboarding/patient");
    const { resetFixturePatientDraft } = await import("@/modules/onboarding/fixture");
    resetFixturePatientDraft(FIXTURE_IDS.patientNew);
    const patient = () => {
      const s = fixtureSessionFor("patient_new");
      if (s.kind !== "authenticated") throw new Error("expected a session");
      return workspaceStateFor(s.identity, "patient");
    };
    expect(patient()).toBe("onboarding_incomplete");
    const onboarding = createFixtureOnboardingApi({ env, actorId: FIXTURE_IDS.patientNew });
    const payload = questionnaireFromDraft(FIXTURE_PATIENT_DRAFT_COMPLETE);
    expect(payload).not.toBeNull();
    const done = await onboarding.submitPatientQuestionnaire(payload as never);
    expect(done.ok).toBe(true);
    expect(patient()).toBe("active");
    resetFixturePatientDraft(FIXTURE_IDS.patientNew);
    expect(patient()).toBe("onboarding_incomplete");
  });
});
