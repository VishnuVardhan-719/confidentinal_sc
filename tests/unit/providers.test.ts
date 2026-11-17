import { describe, expect, it } from "vitest";
import { providerCreateSchema, providerPatchSchema, documentSchema, reviewSchema } from "@/lib/validation/providers";

describe("provider input boundaries", () => {
  it.each(["doctor", "lab", "ambulance", "caretaker"])("accepts %s onboarding", category => {
    expect(providerCreateSchema.safeParse({ category, displayName: "Synthetic provider" }).success).toBe(true);
  });
  it("rejects owner and approval injection", () => {
    expect(providerCreateSchema.safeParse({ category: "doctor", displayName: "Synthetic", ownerId: "attacker" }).success).toBe(false);
    expect(providerPatchSchema.safeParse({ displayName: "Synthetic", description: "", expectedVersion: 1, verificationState: "approved" }).success).toBe(false);
  });
  it("requires version and reason for admin review", () => {
    expect(reviewSchema.safeParse({ decision: "approved", reason: "", expectedVersion: 1 }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "approved", reason: "Evidence checked", expectedVersion: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "approved", reason: "Evidence checked", expectedVersion: 2 }).success).toBe(true);
  });
  it("accepts only bounded credential metadata, never a filename", () => {
    const doc = { kind: "registration", contentType: "application/pdf", expiresAt: "2030-01-01T00:00:00Z", expectedVersion: 1 };
    expect(documentSchema.safeParse(doc).success).toBe(true);
    for (const extra of [{ filename: "patient-name.pdf" }, { contentType: "text/html" }, { expiresAt: null }]) {
      expect(documentSchema.safeParse({ ...doc, ...extra }).success).toBe(false);
    }
  });
});
