import { describe, expect, it } from "vitest";
import { createFixtureOnboardingApi, createFixtureOnboardingStore } from "@/modules/onboarding/fixture";
import {
  listedEditorFrom,
  listedValueFrom,
  paiseToRupeesInput,
  pinsFromText,
  rupeesToPaise,
  withoutBlankRows,
  compactOptional,
} from "@/modules/onboarding/form-models";
import { runCreateProvider, runSavePatientSection, runSaveProviderSection, runSubmitPatientQuestionnaire, runSubmitProvider } from "@/modules/onboarding/flows";
import { loadPatientOnboarding, loadProviderOnboarding } from "@/modules/onboarding/loaders";
import { PATIENT_STEPS, patientCompletion } from "@/modules/onboarding/patient";
import { buildWizard, saveStateFrom } from "@/modules/onboarding/wizard";
import { FIXTURE_IDS, FIXTURE_PATIENT_DRAFT_NEW, FIXTURE_SESSIONS } from "@/fixtures/identity";
import type { Workspace } from "@/modules/auth/types";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };

const workspacesOf = (s: (typeof FIXTURE_SESSIONS)[keyof typeof FIXTURE_SESSIONS]): Workspace[] =>
  s.kind === "authenticated" ? s.identity.workspaces : [];

describe("money and list inputs", () => {
  it("parses rupees exactly into paise", () => {
    expect(rupeesToPaise("800")).toBe(80_000);
    expect(rupeesToPaise("₹ 1,250.5")).toBe(125_050);
    expect(rupeesToPaise("0.07")).toBe(7);
    for (const bad of ["", "-5", "1.234", "abc", "1e3", "12.3.4"]) expect(rupeesToPaise(bad)).toBeNull();
    expect(paiseToRupeesInput(80_050)).toBe("800.50");
    expect(paiseToRupeesInput(80_000)).toBe("800");
    expect(pinsFromText("500001, 500002\n500003;500004")).toEqual(["500001", "500002", "500003", "500004"]);
  });

  it("None/Unknown discard typed details; blank rows and empty optionals are dropped", () => {
    const items = [{ substance: "Synthetic allergen" }];
    expect(listedValueFrom({ state: "none", items })).toEqual({ state: "none" });
    expect(listedValueFrom({ state: "known", items })).toEqual({ state: "known", items });
    expect(listedValueFrom({ state: null, items })).toBeNull();
    expect(listedEditorFrom({ state: "unknown" })).toEqual({ state: "unknown", items: [] });
    expect(withoutBlankRows([{ a: " " }, { a: "x" }])).toEqual([{ a: "x" }]);
    expect(compactOptional({ substance: "x", reaction: "  " })).toEqual({ substance: "x" });
  });
});

describe("wizard model", () => {
  it("resumes at the first missing required step and honours valid requested steps only", () => {
    const completion = patientCompletion(FIXTURE_PATIENT_DRAFT_NEW.sections);
    const resumed = buildWizard(PATIENT_STEPS, completion, "/en/patient/onboarding");
    expect(resumed.current).toBe("measurements");
    expect(resumed.previous).toBe("bloodGroup");
    expect(resumed.next).toBe("allergies");
    expect(resumed.position).toBe(4);
    expect(resumed.steps.find((s) => s.id === "allergies")?.href).toBe("/en/patient/onboarding?step=allergies");
    expect(buildWizard(PATIENT_STEPS, completion, "/en/patient/onboarding", "family").current).toBe("family");
    expect(buildWizard(PATIENT_STEPS, completion, "/en/patient/onboarding", "<script>").current).toBe("measurements");
  });

  it("maps save results to UI states", () => {
    expect(saveStateFrom({ ok: true, data: { version: 3 } }, null)).toEqual({ status: "saved", version: 3 });
    expect(saveStateFrom({ ok: true, data: { version: 3 } }, "/next")).toEqual({ status: "redirect", to: "/next" });
    expect(saveStateFrom({ ok: false, error: { code: "conflict" } }, null).status).toBe("conflict");
    expect(saveStateFrom({ ok: false, error: { code: "gated" } }, null).status).toBe("gated");
    expect(saveStateFrom({ ok: false, error: { code: "validation", fields: { items: "items_required" } } }, null)).toEqual({
      status: "invalid",
      errorKey: "onboarding.errors.checkFields",
      fieldErrors: { items: "errors.fields.items_required" },
    });
  });
});

describe("patient onboarding flow", () => {
  it("loads, saves with version checks, advances and submits from the server draft", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore({ actor: "new" }), actorId: "actor" });
    const view = await loadPatientOnboarding(api, "en");
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.wizard.current).toBe("measurements");

    let version = view.draft.version;
    const save = async (section: string, value: unknown) => {
      const state = await runSavePatientSection(api, { section, value, expectedVersion: version, advance: true }, "en");
      if (state.status === "redirect") version += 1;
      return state;
    };
    expect(await save("medicines", { state: "unknown" })).toEqual({ status: "redirect", to: "/en/patient/onboarding?step=surgeries" });
    expect((await runSavePatientSection(api, { section: "surgeries", value: { state: "none" }, expectedVersion: 0, advance: false }, "en")).status).toBe("conflict");
    expect((await runSavePatientSection(api, { section: "account", value: { contactVerified: true }, expectedVersion: version, advance: false }, "en")).status).toBe("error");
    expect((await runSavePatientSection(api, { section: "bogus", value: {}, expectedVersion: version, advance: false }, "en")).status).toBe("invalid");

    expect(await runSubmitPatientQuestionnaire(api, "en")).toMatchObject({ status: "incomplete" });
    await save("measurements", { heightCm: 170, weightKg: 70 });
    await save("surgeries", { state: "none" });
    await save("medicalHistory", { state: "none" });
    await save("family", { state: "none" });
    await save("documents", { state: "none" });
    await save("review", { policyVersion: "fixture-consent-v0", consent: true });
    expect(await runSubmitPatientQuestionnaire(api, "en")).toEqual({ status: "redirect", to: "/en/patient/dashboard" });
  });

  it("http-style gated draft becomes a gated page state", async () => {
    const gatedApi = { ...createFixtureOnboardingApi({ env: DEV, patientDraft: "empty" }), getPatientDraft: async () => ({ ok: false as const, error: { code: "gated" as const } }) };
    expect(await loadPatientOnboarding(gatedApi, "en")).toEqual({ kind: "gated" });
  });
});

describe("provider onboarding flow", () => {
  it("loads the workspace provider with a setup summary", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore() });
    const view = await loadProviderOnboarding(api, "ambulance", workspacesOf(FIXTURE_SESSIONS.ambulance_changes_required), "en");
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.summary).toMatchObject({ status: "changes_required", canEdit: true, canSubmit: false });
    expect(view.summary.missingRequired).toEqual(["fleet", "crew", "availability", "pricing", "documents"]);
    expect(view.wizard.current).toBe("fleet");
  });

  it("not_started without a provider; another category's draft is refused", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore() });
    expect(await loadProviderOnboarding(api, "lab", [], "en")).toEqual({ kind: "not_started", category: "lab" });
    expect(await loadProviderOnboarding(api, "lab", [], "en", undefined, FIXTURE_IDS.doctorDraftProvider)).toEqual({ kind: "forbidden" });
    expect(await loadProviderOnboarding(api, "lab", [], "en", undefined, "not-a-uuid")).toEqual({ kind: "not_started", category: "lab" });
  });

  it("create resumes an existing provider instead of duplicating; new ones carry the lookup id", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore() });
    expect(await runCreateProvider(api, workspacesOf(FIXTURE_SESSIONS.doctor_draft), { category: "doctor", displayName: "X" }, "en")).toEqual({
      status: "redirect",
      to: "/en/doctor/onboarding",
    });
    const created = await runCreateProvider(api, [], { category: "caretaker", displayName: "Synthetic Caregiver" }, "en");
    expect(created.status).toBe("redirect");
    if (created.status === "redirect") expect(created.to).toMatch(/^\/en\/caretaker\/onboarding\?provider=[0-9a-f-]{36}$/);
    expect(await runCreateProvider(api, [], { category: "caretaker", displayName: " " }, "en")).toMatchObject({ status: "invalid" });
    expect(await runCreateProvider(api, [], { category: "admin", displayName: "X" }, "en")).toMatchObject({ status: "invalid" });
  });

  it("save advances with the provider id; submit reports missing steps", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore() });
    const id = FIXTURE_IDS.doctorDraftProvider;
    const saved = await runSaveProviderSection(api, { category: "doctor", providerId: id, sectionId: "listing", value: { displayName: "Synthetic Doctor C" }, expectedVersion: 2, advance: true }, "en");
    expect(saved).toEqual({ status: "redirect", to: `/en/doctor/onboarding?step=identity&provider=${id}` });
    const submit = await runSubmitProvider(api, { category: "doctor", providerId: id, expectedVersion: 3 }, "en");
    expect(submit).toEqual({ status: "incomplete", missing: ["identity", "practice", "availability", "documents"] });
  });
});
