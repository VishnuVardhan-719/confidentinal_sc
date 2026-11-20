import { describe, expect, it } from "vitest";
import { createAdminFixtureApi } from "@/modules/admin/fixture";
import { getAdminApi } from "@/modules/admin";
import { createAmbulanceFixtureApi } from "@/modules/ambulance/fixture";
import { getAmbulanceApi } from "@/modules/ambulance";
import { createAuditFixtureApi } from "@/modules/audit/fixture";
import { getAuditApi } from "@/modules/audit";
import { createCaretakerFixtureApi } from "@/modules/caretaker/fixture";
import { getCaretakerApi } from "@/modules/caretaker";
import { createContentFixtureApi, createPublicContentFixtureApi } from "@/modules/content/fixture";
import { getContentApi, getPublicContentApi } from "@/modules/content";
import { createLabFixtureApi } from "@/modules/lab/fixture";
import { getLabApi } from "@/modules/lab";
import { SYNTHETIC_MARKER } from "@/fixtures/operations/guard";
import { labFixtures } from "@/fixtures/operations/lab";
import { ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { caretakerFixtures } from "@/fixtures/operations/caretaker";
import { adminFixtures } from "@/fixtures/operations/admin";
import { contentFixtures } from "@/fixtures/operations/content";
import { auditFixtures } from "@/fixtures/operations/audit";

const PROD_FIXTURE = { APP_ENV: "production", FRONTEND_ADAPTER: "fixture" };
const PROD = { APP_ENV: "production" };

const getters = {
  lab: (env: Record<string, string>) => getLabApi({ env }),
  ambulance: (env: Record<string, string>) => getAmbulanceApi({ env }),
  caretaker: (env: Record<string, string>) => getCaretakerApi({ env }),
  admin: (env: Record<string, string>) => getAdminApi({ env }),
  content: (env: Record<string, string>) => getContentApi({ env }),
  publicContent: (env: Record<string, string>) => getPublicContentApi({ env }),
  audit: (env: Record<string, string>) => getAuditApi({ env }),
};

const factories = {
  lab: () => createLabFixtureApi({ env: PROD }),
  ambulance: () => createAmbulanceFixtureApi({ env: PROD }),
  caretaker: () => createCaretakerFixtureApi({ env: PROD }),
  admin: () => createAdminFixtureApi({ env: PROD }),
  content: () => createContentFixtureApi({ env: PROD }),
  publicContent: () => createPublicContentFixtureApi({ env: PROD }),
  audit: () => createAuditFixtureApi({ env: PROD }),
};

describe("fixture refused in production", () => {
  it.each(Object.entries(getters))("%s getter throws for fixture mode in production", (_name, get) => {
    expect(() => get(PROD_FIXTURE)).toThrow(/not allowed|fixtures are disabled/);
  });

  it.each(Object.entries(factories))("%s fixture factory throws when constructed directly in production", (_name, make) => {
    expect(make).toThrow(/not allowed|fixtures are disabled/);
  });

  it.each(Object.entries(getters))("%s defaults to http and selects fixture only when asked outside production", (_name, get) => {
    expect(get({}).mode).toBe("http");
    expect(get(PROD).mode).toBe("http");
    expect(get({ FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" }).mode).toBe("fixture");
  });

  it("every fixture dataset is flagged synthetic", () => {
    for (const data of [labFixtures, ambulanceFixtures, caretakerFixtures, adminFixtures, contentFixtures, auditFixtures]) {
      expect(data.synthetic).toBe(SYNTHETIC_MARKER.synthetic);
      expect(data.source).toBe("fictional");
    }
  });

  it("fixture PINs stay in the fictional 9999xx range", () => {
    const text = JSON.stringify([labFixtures, ambulanceFixtures, caretakerFixtures, adminFixtures]);
    const pins = [...text.matchAll(/"(?:pin|servicePin)":"(\d{6})"/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.every((p) => p.startsWith("9999"))).toBe(true);
  });
});
