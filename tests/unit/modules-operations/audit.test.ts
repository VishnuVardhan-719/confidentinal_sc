import { describe, expect, it } from "vitest";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { auditFixtures } from "@/fixtures/operations/audit";
import { createAuditFixtureApi } from "@/modules/audit/fixture";
import { createAuditHttpApi } from "@/modules/audit/http";
import { auditFilterSchema, redactAuditEvent, redactMetadata } from "@/modules/audit/rules";

describe("audit redaction", () => {
  it("drops non-allowlisted keys, nested payloads and secrets", () => {
    const events = auditFixtures.rawEvents.map(redactAuditEvent);
    const serialized = JSON.stringify(events);
    for (const leak of ["eyJhbGci", "Bearer", "482913", "+919000000000", "90000 00000", "Fixture street", "accessToken", "authorization", "otp", "phone", "address", "payload", "nested"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(events[0].metadata).toEqual({ decision: "approved", fromState: "under_review", toState: "approved", version: 7 });
    expect(events[0].reason).toContain("[redacted]");
  });

  it("scrubs token-like and contact values even under allowlisted keys", () => {
    const out = redactMetadata({ reasonCode: "eyJabcdefghij.klmnopqrstu", decision: "mail a@b.co", version: { nested: 1 }, flag: Number.NaN });
    expect(out).toEqual({ reasonCode: "[redacted]", decision: "mail [redacted]" });
  });
});

describe("audit scope and filters", () => {
  it("is deny-by-default and org-scoped", async () => {
    expect(await createAuditFixtureApi({ env: {}, principal: adminPrincipals.verifier }).listEvents()).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await createAuditFixtureApi({ env: {}, principal: null }).listEvents()).toEqual({ ok: false, error: { code: "forbidden" } });
    const org = await createAuditFixtureApi({ env: {}, principal: adminPrincipals.orgAuditor }).listEvents();
    expect(org.ok && org.data.items.every((e) => e.organizationId === "fx-org-1")).toBe(true);
    expect(org.ok && org.data.items).toHaveLength(3);
  });

  it("applies structured filters and rejects free-text payload search", async () => {
    const api = createAuditFixtureApi({ env: {}, principal: adminPrincipals.superAdmin });
    const denied = await api.listEvents({ outcome: "denied" });
    expect(denied.ok && denied.data.items.map((e) => e.id)).toEqual(["fx-aud-5", "fx-aud-3"]);
    expect(auditFilterSchema.safeParse({ payloadContains: "phone" }).success).toBe(false);
    expect(auditFilterSchema.safeParse({ from: "2026-11-20T00:00:00Z", to: "2026-11-19T00:00:00Z" }).success).toBe(false);
    expect(await createAuditHttpApi().listEvents()).toEqual({ ok: false, error: { code: "gated" } });
  });
});
