/**
 * ADVERSARIAL_REVIEW.md finding 2 (feat/fe2-c): the fixture adapter must be unreachable in
 * production. The guard is an allowlist (APP_ENV development/test/preview/staging, or APP_ENV unset under
 * `next dev`/the test runner) and VERCEL_ENV=production always refuses. The real process env is
 * authoritative, so each case is checked both injected and as the real env.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFixtureAllowed } from "@/fixtures/clinical/world";
import { assertFixtureMode } from "@/lib/api/fixture";
import { fixtureRefusal, getAdapterMode, isFixtureMode } from "@/lib/api/mode";
import { getDoctorApi } from "@/modules/doctor";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getRecordsApi } from "@/modules/records";

const FIXTURE = { FRONTEND_ADAPTER: "fixture" };

/** Production-like env shapes that must never serve fixtures. */
const REFUSED: Record<string, string | undefined>[] = [
  { APP_ENV: "production" },
  { APP_ENV: "prod" },
  { APP_ENV: "Production" },
  { APP_ENV: "stage" },
  { APP_ENV: "staging", VERCEL_ENV: "production" },
  { APP_ENV: undefined, NODE_ENV: "production" },
  { APP_ENV: "", NODE_ENV: "production" },
  { VERCEL_ENV: "production" },
  { APP_ENV: "preview", VERCEL_ENV: "production" },
  { APP_ENV: "test", VERCEL_ENV: "production" },
];
const ALLOWED: Record<string, string | undefined>[] = [
  { APP_ENV: "development", NODE_ENV: "production" },
  { APP_ENV: "test", NODE_ENV: "production" },
  { APP_ENV: "preview", NODE_ENV: "production", VERCEL_ENV: "preview" },
  { APP_ENV: "staging", NODE_ENV: "production" },
  { APP_ENV: undefined, NODE_ENV: "development" },
  { APP_ENV: undefined, NODE_ENV: "test" },
];
const label = (e: Record<string, string | undefined>) => JSON.stringify(e);

afterEach(() => vi.unstubAllEnvs());

/** Make the real process env look like `e` (NODE_ENV included). */
function stubRealEnv(e: Record<string, string | undefined>) {
  for (const k of ["APP_ENV", "NODE_ENV", "VERCEL_ENV"] as const) vi.stubEnv(k, e[k] ?? "");
}

describe("fixture production guard (finding 2)", () => {
  it.each(REFUSED.map((e) => [label(e), e] as const))("refuses an injected env %s", (_, e) => {
    const env = { ...FIXTURE, ...e };
    expect(fixtureRefusal(env)).not.toBeNull();
    expect(() => getAdapterMode(env)).toThrow(/disabled/);
    expect(() => isFixtureMode(env)).toThrow();
    expect(() => assertFixtureAllowed(env)).toThrow();
    expect(() => assertFixtureMode(env)).toThrow();
    expect(() => getDoctorApi(env)).toThrow();
    expect(() => getRecordsApi(env)).toThrow();
    expect(() => getPatientSession({ ...env, FIXTURE_PATIENT_SESSION: "self" })).toThrow();
  });

  it.each(REFUSED.map((e) => [label(e), e] as const))("refuses when the real env is %s, whatever is injected", (_, e) => {
    stubRealEnv(e);
    const lifted = { ...FIXTURE, APP_ENV: "test", NODE_ENV: "test", VERCEL_ENV: "" };
    expect(fixtureRefusal(lifted)).not.toBeNull();
    expect(() => getAdapterMode(lifted)).toThrow();
    expect(() => getAdapterMode({ ...FIXTURE })).toThrow();
    expect(() => assertFixtureAllowed(lifted)).toThrow();
    expect(() => assertFixtureMode(lifted)).toThrow();
  });

  it.each(ALLOWED.map((e) => [label(e), e] as const))("allows %s", (_, e) => {
    stubRealEnv(e);
    expect(fixtureRefusal({ ...FIXTURE, ...e })).toBeNull();
    expect(getAdapterMode({ ...FIXTURE, ...e })).toBe("fixture");
    expect(() => assertFixtureAllowed(e)).not.toThrow();
  });

  it("http mode never consults the guard and never throws", () => {
    stubRealEnv({ APP_ENV: "production", NODE_ENV: "production" });
    expect(getAdapterMode({ APP_ENV: "production" })).toBe("http");
    expect(getAdapterMode({})).toBe("http");
    expect(getPatientSession({ FRONTEND_ADAPTER: "http" })).toEqual({ status: "unauthenticated" });
  });

  it("the e2e workspace servers set an allowlisted APP_ENV (next start runs with NODE_ENV=production)", async () => {
    const { wsEnv } = await import("../e2e/workspace-servers");
    for (const s of ["assigned", "other", "anon", "gateOff"] as const) {
      const env: Record<string, string | undefined> = { NODE_ENV: "production", ...wsEnv(s) };
      expect(env.APP_ENV, s).toBe("test");
      expect(fixtureRefusal(env), s).toBeNull();
    }
  });
});
