import { describe, expect, it } from "vitest";
import {
  CreateProviderInput,
  DecideProviderVerificationInput,
  DocumentAccessInput,
  PROVIDER_DOCUMENT_MAX_BYTES,
  RegisterProviderDocumentInput,
  ReviewProviderDocumentInput,
  SubmitProviderVerificationInput,
  SuspendProviderInput,
} from "@/lib/contracts/providers";

const id = () => crypto.randomUUID();
const doc = (over: Record<string, unknown> = {}) => ({
  providerId: id(),
  subjectProfileId: null,
  documentType: "doc_government_id",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  idempotencyKey: id(),
  ...over,
});

describe("provider contract", () => {
  it("accepts an individual doctor and trims the name", () => {
    const parsed = CreateProviderInput.parse({ category: "doctor", organizationId: null, displayName: "  SYNTHETIC Dr  " });
    expect(parsed.displayName).toBe("SYNTHETIC Dr");
  });
  it("rejects unknown categories, blank names and individually owned labs", () => {
    expect(CreateProviderInput.safeParse({ category: "pharmacy", organizationId: null, displayName: "x" }).success).toBe(false);
    expect(CreateProviderInput.safeParse({ category: "doctor", organizationId: null, displayName: "   " }).success).toBe(false);
    expect(CreateProviderInput.safeParse({ category: "lab", organizationId: null, displayName: "x" }).success).toBe(false);
    expect(CreateProviderInput.safeParse({ category: "lab", organizationId: id(), displayName: "x" }).success).toBe(true);
  });
});

describe("document contract", () => {
  it("accepts allowed files up to 5 MiB", () => {
    expect(RegisterProviderDocumentInput.safeParse(doc({ sizeBytes: PROVIDER_DOCUMENT_MAX_BYTES })).success).toBe(true);
  });
  it("rejects oversize, empty and disallowed files", () => {
    expect(RegisterProviderDocumentInput.safeParse(doc({ sizeBytes: PROVIDER_DOCUMENT_MAX_BYTES + 1 })).success).toBe(false);
    expect(RegisterProviderDocumentInput.safeParse(doc({ sizeBytes: 0 })).success).toBe(false);
    expect(RegisterProviderDocumentInput.safeParse(doc({ mimeType: "text/html" })).success).toBe(false);
  });
  it("rejects invalid or inverted dates and malformed type codes", () => {
    expect(RegisterProviderDocumentInput.safeParse(doc({ expiresOn: "2026-02-30" })).success).toBe(false);
    expect(RegisterProviderDocumentInput.safeParse(doc({ issuedOn: "2026-05-01", expiresOn: "2026-04-01" })).success).toBe(false);
    expect(RegisterProviderDocumentInput.safeParse(doc({ documentType: "../etc" })).success).toBe(false);
  });
  it("restricts document access purposes", () => {
    expect(DocumentAccessInput.safeParse({ documentId: id(), purpose: "public" }).success).toBe(false);
  });
});

describe("verification contract", () => {
  it("requires a positive expected version and an idempotency key to submit", () => {
    expect(SubmitProviderVerificationInput.safeParse({ caseId: id(), expectedVersion: 0, idempotencyKey: id() }).success).toBe(false);
    expect(SubmitProviderVerificationInput.safeParse({ caseId: id(), expectedVersion: 1 }).success).toBe(false);
  });
  it("requires reasons for rejection and suspension", () => {
    expect(ReviewProviderDocumentInput.safeParse({ documentId: id(), decision: "rejected", expectedVersion: 1 }).success).toBe(false);
    const base = { caseId: id(), expectedVersion: 1, idempotencyKey: id() };
    expect(DecideProviderVerificationInput.safeParse({ ...base, decision: "rejected" }).success).toBe(false);
    expect(DecideProviderVerificationInput.safeParse({ ...base, decision: "rejected", reasonCode: "DOC_UNREADABLE" }).success).toBe(true);
    expect(SuspendProviderInput.safeParse({ ...base, reasonCode: "lowercase" }).success).toBe(false);
  });
  it("requires a validity end to approve and allows only approve/reject decisions", () => {
    const base = { caseId: id(), expectedVersion: 1, idempotencyKey: id() };
    expect(DecideProviderVerificationInput.safeParse({ ...base, decision: "approved" }).success).toBe(false);
    expect(
      DecideProviderVerificationInput.safeParse({ ...base, decision: "approved", verifiedUntil: "2027-01-01T00:00:00Z" }).success,
    ).toBe(true);
    expect(DecideProviderVerificationInput.safeParse({ ...base, decision: "suspended", reasonCode: "XYZ" }).success).toBe(false);
  });
});
