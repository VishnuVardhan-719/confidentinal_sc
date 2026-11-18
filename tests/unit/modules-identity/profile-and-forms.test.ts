import { describe, expect, it } from "vitest";
import { catalogKey } from "@/components/auth/message-key";
import { withoutLocale } from "@/components/auth/paths";
import { formatCoordinates } from "@/components/onboarding/coordinates";
import { fieldDomId, sectionFromForm, sectionToForm } from "@/components/onboarding/form-spec";
import { PATIENT_SPECS, PROVIDER_SPECS } from "@/components/onboarding/section-specs";
import { setAt } from "@/components/onboarding/state-path";
import { ACCOUNT_NAV, navFor, ROLE_NAV } from "@/modules/auth/nav";
import { ROLES } from "@/modules/auth/roles";
import { createFixtureOnboardingApi, createFixtureOnboardingStore } from "@/modules/onboarding/fixture";
import { runSaveProfile } from "@/modules/onboarding/flows";
import { loadPatientProfile } from "@/modules/onboarding/loaders";
import { patientSectionSchemas, type PatientDraft } from "@/modules/onboarding/patient";
import {
  ageOnDate,
  PROFILE_FORM_SECTIONS,
  PROFILE_ITEM_FIELD,
  PROFILE_ITEMS,
  profileCompleteness,
  profileFromDraft,
} from "@/modules/onboarding/profile";
import { providerSectionSchema } from "@/modules/onboarding/provider";
import { FIXTURE_PATIENT_DRAFT_COMPLETE, FIXTURE_PATIENT_DRAFT_NEW, FIXTURE_SESSIONS } from "@/fixtures/identity";

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const NOW = new Date("2026-11-18T00:00:00Z");

describe("profile at a glance: 13-item readiness", () => {
  it("has exactly 13 items, each mapped to a form field", () => {
    expect(PROFILE_ITEMS).toHaveLength(13);
    for (const id of PROFILE_ITEMS) expect(PROFILE_ITEM_FIELD[id]).toMatch(/^[a-zA-Z]+\.[a-zA-Z0-9]+$/);
  });

  it("complete synthetic draft is ready to book; partial lists what is missing", () => {
    const ready = profileCompleteness(profileFromDraft(FIXTURE_PATIENT_DRAFT_COMPLETE, NOW));
    expect(ready).toMatchObject({ completed: 13, total: 13, readyToBook: true, missing: [] });
    const partial = profileCompleteness(profileFromDraft(FIXTURE_PATIENT_DRAFT_NEW, NOW));
    expect(partial.completed).toBe(6);
    expect(partial.missing).toEqual(["gender", "location", "height", "weight", "medicalHistory", "medicines", "surgeries"]);
    expect(partial.readyToBook).toBe(false);
  });

  it("None and Unknown answers count as answered; a stated age does not satisfy date of birth", () => {
    const base = structuredClone(FIXTURE_PATIENT_DRAFT_COMPLETE);
    base.sections.allergies = { state: "unknown" };
    base.sections.bloodGroup = { state: "unknown" };
    expect(profileCompleteness(profileFromDraft(base, NOW)).readyToBook).toBe(true);
    const aged: PatientDraft = structuredClone(base);
    aged.sections.personal = { ...aged.sections.personal!, birth: { kind: "age", years: 40 } };
    const view = profileFromDraft(aged, NOW);
    expect(view.identity.ageYears).toBe(40);
    expect(profileCompleteness(view).missing).toEqual(["dateOfBirth"]);
  });

  it("health record is always unverified and mobile verification comes only from the server", () => {
    const view = profileFromDraft(FIXTURE_PATIENT_DRAFT_COMPLETE, NOW);
    expect(view.health.verification).toBe("unverified");
    expect(view.identity.mobileVerified).toBe(false);
    const verified = structuredClone(FIXTURE_PATIENT_DRAFT_COMPLETE);
    verified.sections.account = { contactVerified: true, phoneVerified: true };
    expect(profileFromDraft(verified, NOW).identity.mobileVerified).toBe(true);
  });

  it("computes age from date of birth on the given day", () => {
    expect(ageOnDate("1984-03-15", NOW)).toBe(42);
    expect(ageOnDate("1984-11-19", NOW)).toBe(41);
    expect(ageOnDate("not-a-date", NOW)).toBeNull();
  });

  it("formats pinned coordinates with accuracy", () => {
    expect(formatCoordinates(17.52941, 78.39463, 137.4)).toBe("17.5294, 78.3946 (±137 m)");
    expect(formatCoordinates(17.5, 78.4, 0)).toBe("17.5000, 78.4000");
  });
});

describe("profile schema rules", () => {
  it("validates height and weight ranges and one decimal", () => {
    const m = patientSectionSchemas.measurements;
    expect(m.safeParse({ heightCm: 168, weightKg: 64.5 }).success).toBe(true);
    expect(m.safeParse({ heightCm: 168, weightKg: 64.55 }).success).toBe(false);
    expect(m.safeParse({ heightCm: 20, weightKg: 64 }).success).toBe(false);
    expect(m.safeParse({ heightCm: 168.5, weightKg: 64 }).success).toBe(false);
  });

  it("pinned location must be real coordinates; gender is a fixed list", () => {
    const personal = { ...FIXTURE_PATIENT_DRAFT_COMPLETE.sections.personal! };
    const p = patientSectionSchemas.personal;
    expect(p.safeParse(personal).success).toBe(true);
    expect(p.safeParse({ ...personal, location: { ...personal.location!, lat: 123 } }).success).toBe(false);
    expect(p.safeParse({ ...personal, gender: "unspecified" }).success).toBe(false);
    expect(p.safeParse({ ...personal, email: "not-an-email" }).success).toBe(false);
  });
});

describe("spec-driven forms", () => {
  it("round-trips every complete patient section through form state", () => {
    const s = FIXTURE_PATIENT_DRAFT_COMPLETE.sections;
    for (const id of PROFILE_FORM_SECTIONS) {
      const spec = PATIENT_SPECS[id];
      const value = sectionFromForm(spec, sectionToForm(spec, s[id]));
      const parsed = patientSectionSchemas[id].safeParse(value);
      expect(parsed.success, id).toBe(true);
      expect(parsed.success && parsed.data).toEqual(s[id]);
    }
  });

  it("an unanswered question is not saved; None discards typed rows", () => {
    const spec = PATIENT_SPECS.allergies;
    expect(sectionFromForm(spec, { kind: "answer", state: "", items: [], value: "" })).toBeNull();
    expect(sectionFromForm(spec, { kind: "answer", state: "none", items: [{ substance: "Synthetic", reaction: "" }], value: "" })).toEqual({ state: "none" });
    expect(sectionFromForm(spec, { kind: "answer", state: "known", items: [{ substance: "Synthetic", reaction: "" }, { substance: "", reaction: "" }], value: "" })).toEqual({
      state: "known",
      items: [{ substance: "Synthetic" }],
    });
  });

  it("converts rupees, PIN lists, numbers and phones for provider sections", () => {
    const spec = PROVIDER_SPECS.doctor.practice;
    if (spec.kind !== "fields") throw new Error("fields");
    const value = sectionFromForm(spec, {
      kind: "fields",
      values: { homeVisitFeePaise: "₹ 800.50", servicePins: "500001, 500002", travelRadiusKm: "12", startingPoint: { pinCode: "500001", locality: "Synthetic" } },
    });
    expect(value).toEqual({ homeVisitFeePaise: 80_050, servicePins: ["500001", "500002"], travelRadiusKm: 12, startingPoint: { pinCode: "500001", locality: "Synthetic" } });
    expect(providerSectionSchema("doctor", "practice")?.safeParse(value).success).toBe(true);
    const bad = sectionFromForm(spec, { kind: "fields", values: { homeVisitFeePaise: "800.555", servicePins: "", travelRadiusKm: "", startingPoint: { pinCode: "", locality: "" } } });
    expect(providerSectionSchema("doctor", "practice")?.safeParse(bad).success).toBe(false);
  });

  it("every provider section spec matches its schema field names", () => {
    for (const [category, sections] of Object.entries(PROVIDER_SPECS)) {
      for (const [sectionId, spec] of Object.entries(sections)) {
        expect(providerSectionSchema(category as "doctor", sectionId), `${category}.${sectionId}`).not.toBeNull();
        if (spec.kind !== "fields") continue;
        const shape = (providerSectionSchema(category as "doctor", sectionId) as unknown as { shape?: Record<string, unknown>; def?: { shape?: Record<string, unknown> } });
        const keys = Object.keys(shape.shape ?? shape.def?.shape ?? {});
        if (keys.length === 0) continue;
        for (const f of spec.fields) expect(keys, `${category}.${sectionId}.${f.name}`).toContain(f.name);
      }
    }
  });

  it("field DOM ids and nested updates are stable", () => {
    expect(fieldDomId("branches.0.pinCode")).toBe("f-branches-0-pinCode");
    expect(setAt({ items: [{ a: "1" }] }, ["items", 0, "a"], "2")).toEqual({ items: [{ a: "2" }] });
    expect(setAt({ g: { x: "" } }, ["g", "x"], "y")).toEqual({ g: { x: "y" } });
  });
});

describe("profile save flow", () => {
  it("saves identity and health sections with chained versions, then returns to the profile", async () => {
    const store = createFixtureOnboardingStore({ actor: "new" });
    const api = createFixtureOnboardingApi({ env: DEV, store, actorId: "actor" });
    const s = FIXTURE_PATIENT_DRAFT_COMPLETE.sections;
    const sections = Object.fromEntries(PROFILE_FORM_SECTIONS.map((id) => [id, s[id]]));
    const result = await runSaveProfile(api, { sections, expectedVersion: 1 }, "te");
    expect(result).toEqual({ status: "redirect", to: "/te/patient/profile" });
    const page = await loadPatientProfile(api, NOW);
    expect(page.kind === "ready" && page.completeness.readyToBook).toBe(true);
  });

  it("stops at the first invalid section with section-prefixed paths and the saved version", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore({ actor: "new" }), actorId: "actor" });
    const result = await runSaveProfile(api, { sections: { bloodGroup: { state: "unknown" }, measurements: { heightCm: 10, weightKg: 70 } }, expectedVersion: 1 }, "en");
    expect(result).toMatchObject({ status: "invalid", version: 2, fieldErrors: { "measurements.heightCm": "errors.fields.height_invalid" } });
  });

  it("rejects payloads that are not the profile sections", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore(), actorId: "actor" });
    expect((await runSaveProfile(api, { sections: { account: { contactVerified: true } }, expectedVersion: 0 }, "en")).status).toBe("invalid");
    expect((await runSaveProfile(api, { sections: {}, expectedVersion: 0, extra: 1 }, "en")).status).toBe("invalid");
  });
});

describe("role navigation and links", () => {
  it("every role has a dashboard first and at most five mobile items; hrefs are locale-less", () => {
    for (const role of ROLES) {
      const nav = ROLE_NAV[role];
      expect(nav[0].href).toBe(`/${role}/dashboard`);
      expect(nav.filter((n) => n.primary).length).toBeLessThanOrEqual(5);
      for (const n of [...nav, ...ACCOUNT_NAV]) expect(n.href).toMatch(/^\/(?!en\/|te\/|hi\/)[a-z/-]+$/);
    }
  });

  it("incomplete patients see only links the guard allows", () => {
    const keys = navFor(FIXTURE_SESSIONS.patient_new, "patient", "en").map((n) => n.key);
    expect(keys).toEqual(["dashboard", "findCare", "profile", "notifications", "support", "settings"]);
    expect(navFor(FIXTURE_SESSIONS.patient_complete, "patient", "en")).toHaveLength(ROLE_NAV.patient.length);
  });

  it("maps module keys to catalogue keys and strips locales for next-intl links", () => {
    expect(catalogKey("errors.unavailable", "auth")).toBe("errors.api.unavailable");
    expect(catalogKey("errors.weird", "auth")).toBe("errors.api.generic");
    expect(catalogKey("errors.fields.otp_invalid", "auth")).toBe("auth.fieldErrors.otp_invalid");
    expect(catalogKey("errors.fields.<script>", "onboarding")).toBe("onboarding.fieldErrors.invalid");
    expect(catalogKey("auth.errors.rateLimited", "auth")).toBe("auth.errors.rateLimited");
    expect(withoutLocale("/te/doctor/dashboard")).toBe("/doctor/dashboard");
    expect(withoutLocale("/en")).toBe("/");
  });
});
