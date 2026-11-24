import { afterEach, describe, expect, it, vi } from "vitest";
import robots, { AI_CRAWLERS } from "@/app/robots";
import { llmsText } from "@/app/llms.txt/route";
import { SITE_URL } from "@/components/public/seo";
import { faqSchema, jsonLdString, organizationSchema, websiteSchema } from "@/components/public/structured-data";
import { FIXTURE_IDS } from "@/fixtures/identity";
import { createFixtureAuthApi, createFixtureChallengeStore } from "@/modules/auth/fixture";
import { createFixtureOnboardingApi } from "@/modules/onboarding/fixture";

afterEach(() => vi.unstubAllEnvs());

describe("structured data (JSON-LD)", () => {
  it("describes the organisation with only facts the site states", () => {
    const org = organizationSchema("Healthcare at your doorstep") as unknown as Record<string, unknown>;
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("SureCure Visit");
    expect(org.url).toBe(SITE_URL);
    const text = JSON.stringify(org);
    for (const banned of ["aggregateRating", "review", "ratingValue", "priceRange", "openingHours", "areaServed"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("describes the website per locale and links the publisher", () => {
    const site = websiteSchema("te", "d") as unknown as Record<string, unknown>;
    expect(site.inLanguage).toBe("te");
    expect(site.publisher).toEqual({ "@id": `${SITE_URL}/#organization` });
  });

  it("builds FAQPage questions from the visible entries", () => {
    const faq = faqSchema([{ q: "Is it live?", a: "Not yet." }]) as unknown as Record<string, unknown>;
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toEqual([{ "@type": "Question", name: "Is it live?", acceptedAnswer: { "@type": "Answer", text: "Not yet." } }]);
  });

  it("escapes < so copy can never close the script tag", () => {
    expect(jsonLdString({ a: "</script><b>" })).not.toContain("<");
    expect(JSON.parse(jsonLdString({ a: "</script>" }))).toEqual({ a: "</script>" });
  });
});

describe("answer-engine crawling", () => {
  it("lets AI crawlers read public pages in production, but never private workspaces", () => {
    vi.stubEnv("APP_ENV", "production");
    const rules = robots().rules as { userAgent: string | string[]; allow?: string; disallow: string[] }[];
    const ai = rules.find((r) => Array.isArray(r.userAgent));
    expect(ai?.userAgent).toEqual([...AI_CRAWLERS]);
    expect(ai?.allow).toBe("/");
    for (const seg of ["patient", "doctor", "lab", "admin", "workspace"]) expect(ai?.disallow).toContain(`/*/${seg}`);
  });

  it("blocks every crawler outside production", () => {
    vi.stubEnv("APP_ENV", "test");
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });

  it("llms.txt exists only in production and states the emergency rule", () => {
    expect(llmsText({ APP_ENV: "test" })).toBeNull();
    const text = llmsText({ APP_ENV: "production" }) ?? "";
    expect(text).toContain("# SureCure Visit");
    expect(text).toContain("call 108");
    expect(text).toContain(`${SITE_URL}/en/faq`);
    expect(text).not.toMatch(/112/);
  });
});

describe("a brand-new signup starts with an empty questionnaire", () => {
  it("clears the sample draft that the demo sign-in account has", async () => {
    const onboarding = createFixtureOnboardingApi({ actorId: FIXTURE_IDS.patientNew, env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" } });
    const before = await onboarding.getPatientDraft();
    expect(before.ok && Object.keys(before.data.sections).length).toBeGreaterThan(1);

    const auth = createFixtureAuthApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" }, challengeStore: createFixtureChallengeStore() });
    await auth.signup({ method: "email_password", role: "patient", email: "fresh.signup@example.invalid", password: "a-long-enough-password", acceptedTerms: true, termsVersion: "v0" });

    const after = await onboarding.getPatientDraft();
    expect(after.ok && Object.keys(after.data.sections)).toEqual(["account"]);
  });
});
