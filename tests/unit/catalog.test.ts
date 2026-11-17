import { afterEach, describe, expect, it, vi } from "vitest";
import { coverageReviewSchema, paiseSchema, pinSchema, searchSchema, serviceSchema } from "@/lib/validation/catalog";

afterEach(() => vi.useRealTimers());

describe("catalog boundary validation", () => {
  it.each(["50001", "5000011", "050001", "5000 1", "50001%", "5%", "' or 1=1 --", "٥٠٠٠٠١"])("rejects unsafe PIN %s", pin => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });
  it("normalizes surrounding PIN whitespace only", () => expect(pinSchema.parse(" 500001 ")).toBe("500001"));
  it.each(["-1", "1.0", "1e3", "01", "9223372036854775808", 100])("rejects invalid paise %s", amount => {
    expect(paiseSchema.safeParse(amount).success).toBe(false);
  });
  it("accepts the price ceiling as exact text and rejects ceiling plus one", () => {
    expect(paiseSchema.parse("10000000000")).toBe("10000000000");
    expect(paiseSchema.safeParse("10000000001").success).toBe(false);
    expect(paiseSchema.safeParse("9223372036854775807").success).toBe(false);
    // Zero is retained until the owner makes the minimum-price decision.
    expect(paiseSchema.parse("0")).toBe("0");
  });
  it("bounds duration at one week", () => {
    const body = { providerId: "10000000-0000-4000-8000-000000000001", catalogTypeId: "10000000-0000-4000-8000-000000000002", title: "Synthetic", durationMinutes: 10080, status: "draft", expectedVersion: 0 };
    expect(serviceSchema.safeParse(body).success).toBe(true);
    expect(serviceSchema.safeParse({ ...body, durationMinutes: 10081 }).success).toBe(false);
  });
  it.each(["2026-11-17T10:00:00.000Z", "2028-02-29T10:00:00.000Z"])("caps approval at 12 calendar months from %s", now => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    const body = { decision: "approved", reason: "Synthetic", expectedVersion: 1 };
    const bound = now.startsWith("2028") ? "2029-02-28T10:00:00.000Z" : "2027-11-17T10:00:00.000Z";
    expect(coverageReviewSchema.safeParse({ ...body, validUntil: bound }).success).toBe(true);
    expect(coverageReviewSchema.safeParse({ ...body, validUntil: new Date(new Date(bound).getTime() + 1).toISOString() }).success).toBe(false);
    expect(coverageReviewSchema.safeParse({ ...body, validUntil: now }).success).toBe(false);
  });
  it("requires exact PIN and bounds pages", () => {
    expect(searchSchema.safeParse({ category: "doctor" }).success).toBe(false);
    expect(searchSchema.safeParse({ category: "doctor", pin: "500001", limit: "1000" }).success).toBe(false);
    expect(searchSchema.safeParse({ category: "doctor", pin: "500001", cursor: "tampered" }).success).toBe(false);
  });
  it("rejects injected verification and invalid duration", () => {
    const body = { providerId: "10000000-0000-4000-8000-000000000001", catalogTypeId: "10000000-0000-4000-8000-000000000002", title: "Synthetic", description: "", durationMinutes: 30, status: "draft", expectedVersion: 0 };
    expect(serviceSchema.safeParse(body).success).toBe(true);
    expect(serviceSchema.safeParse({ ...body, approved: true }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...body, durationMinutes: 0 }).success).toBe(false);
  });
});
