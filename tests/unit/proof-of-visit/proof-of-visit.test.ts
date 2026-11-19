import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I, type ClinicalWorld } from "@/fixtures/clinical/world";
import { formatProofCode, getProofCheckApi, normalizeProofCode, proofCheckResultSchema } from "@/modules/proof-of-visit";
import { createProofCheckFixtureApi } from "@/modules/proof-of-visit/fixture";
import en from "@/messages/en/verify.json";
import te from "@/messages/te/verify.json";
import hi from "@/messages/hi/verify.json";

const env = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
const T0 = new Date("2026-11-19T10:00:00Z");
const CODE = "908f8aae6e005b6164c3acee1a919b5c";

function worldWithProof(p: { expiresAt: string; revokedAt?: string | null }): ClinicalWorld {
  const w = createClinicalWorld(T0);
  w.proofs.set(CODE, { token: CODE, bookingId: I.bookingActive, issuedAt: T0.toISOString(), expiresAt: p.expiresAt, revokedAt: p.revokedAt ?? null });
  return w;
}
const check = (world: ClinicalWorld, code = CODE, now = T0) => createProofCheckFixtureApi({ env, world, now: () => now }).check(code);

describe("normalizeProofCode", () => {
  it("accepts grouped, uppercase or dashed input and returns the canonical code", () => {
    expect(normalizeProofCode(formatProofCode(CODE))).toBe(CODE);
    expect(normalizeProofCode(CODE.toUpperCase())).toBe(CODE);
    expect(normalizeProofCode("908f-8aae-6e00-5b61-64c3-acee-1a91-9b5c")).toBe(CODE);
  });
  it("rejects anything else without a lookup", () => {
    for (const bad of ["", "abc", `${CODE}0`, "zz8f8aae6e005b6164c3acee1a919b5c", "../../etc/passwd", null, 42, "x".repeat(200)]) expect(normalizeProofCode(bad)).toBeNull();
  });
  it("formats in groups of four for reading", () => {
    expect(formatProofCode(CODE)).toBe("908f 8aae 6e00 5b61 64c3 acee 1a91 9b5c");
  });
});

describe("proof check fixture adapter", () => {
  it("valid: only date, category and doctor display name", async () => {
    const r = await check(worldWithProof({ expiresAt: "2026-11-20T10:00:00Z" }));
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.status !== "valid") throw new Error("expected valid");
    expect(Object.keys(r.data).sort()).toEqual(["providerDisplayName", "serviceCategory", "serviceDate", "status"]);
    expect(r.data.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(r.data)).not.toMatch(/Fixture Patient|Synthetic Nagar|\+91|allerg/i);
  });
  it("expired after expiry", async () => {
    expect(await check(worldWithProof({ expiresAt: "2026-11-19T09:00:00Z" }))).toEqual({ ok: true, data: { status: "expired" } });
  });
  it("revoked when withdrawn", async () => {
    expect(await check(worldWithProof({ expiresAt: "2026-11-20T10:00:00Z", revokedAt: "2026-11-19T09:30:00Z" }))).toEqual({ ok: true, data: { status: "revoked" } });
  });
  it("unknown and malformed codes look the same", async () => {
    const w = createClinicalWorld(T0);
    expect(await check(w)).toEqual({ ok: true, data: { status: "unknown" } });
    expect(await check(w, "not-a-code")).toEqual({ ok: true, data: { status: "unknown" } });
  });
});

describe("getProofCheckApi gates", () => {
  it("is gated while the clinical flag is off (no adapter call)", async () => {
    expect(await getProofCheckApi({ FRONTEND_ADAPTER: "fixture" }).check(CODE)).toEqual({ ok: false, error: { code: "gated" } });
  });
  it("http adapter is gated (no public verification contract yet)", async () => {
    expect(await getProofCheckApi({ FEATURE_CLINICAL: "true" }).check(CODE)).toEqual({ ok: false, error: { code: "gated" } });
  });
  it("refuses fixture data in production", () => {
    expect(() => getProofCheckApi({ FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true", APP_ENV: "production" })).toThrow();
  });
});

describe("schema and messages", () => {
  it("rejects extra fields on a result", () => {
    expect(proofCheckResultSchema.safeParse({ status: "valid", serviceDate: "2026-11-19", serviceCategory: "doctor_visit", providerDisplayName: "Dr. X", patientName: "Y" }).success).toBe(false);
    expect(proofCheckResultSchema.safeParse({ status: "unknown", reason: "x" }).success).toBe(false);
  });
  it("every result state has a title and body in en, te and hi", () => {
    for (const m of [en, te, hi]) for (const s of ["valid", "expired", "revoked", "unknown"] as const) {
      expect(m.result[s].title).toBeTruthy();
      expect(m.result[s].body).toBeTruthy();
    }
  });
});
