import { describe, expect, it } from "vitest";
import { paiseSchema, pinSchema, searchSchema, serviceSchema } from "@/lib/validation/catalog";

describe("catalog boundary validation", () => {
  it.each(["50001", "5000011", "050001", "5000 1", "50001%", "5%", "' or 1=1 --", "٥٠٠٠٠١"])("rejects unsafe PIN %s", pin => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });
  it("normalizes surrounding PIN whitespace only", () => expect(pinSchema.parse(" 500001 ")).toBe("500001"));
  it.each(["-1", "1.0", "1e3", "01", "9223372036854775808", 100])("rejects invalid paise %s", amount => {
    expect(paiseSchema.safeParse(amount).success).toBe(false);
  });
  it("preserves bigint precision as text", () => expect(paiseSchema.parse("9223372036854775807")).toBe("9223372036854775807"));
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
