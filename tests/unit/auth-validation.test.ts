import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/components/ui/form-field";
import {
  checkIndianMobile,
  emailSchema,
  forgotPasswordSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

describe("Indian mobile numbers", () => {
  it.each(["9876543210", "98765 43210", "+91 98765 43210", "+91-98765-43210", "919876543210", "09876543210", "(+91) 98765-43210"])(
    "accepts %s and normalises to E.164",
    (input) => {
      expect(checkIndianMobile(input)).toEqual({ ok: true, e164: "+919876543210" });
    },
  );

  it.each([
    ["", "Enter your mobile number"],
    ["98765abc10", "Use digits only, for example 98765 43210"],
    ["987654321", "Enter a 10-digit Indian mobile number"],
    ["98765432101", "Enter a 10-digit Indian mobile number"],
    ["+1 4155550123", "Enter a 10-digit Indian mobile number"],
    ["5876543210", "Indian mobile numbers start with 6, 7, 8 or 9"],
    ["0123456789", "Indian mobile numbers start with 6, 7, 8 or 9"],
  ])("rejects %j", (input, message) => {
    expect(checkIndianMobile(input)).toEqual({ ok: false, message });
  });
});

describe("email", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Asha.R@Example.COM ")).toBe("asha.r@example.com");
  });
  it.each(["", "asha", "asha@", "@example.com", "asha@example"])("rejects %j", (v) => {
    expect(emailSchema.safeParse(v).success).toBe(false);
  });
});

describe("new password rules", () => {
  it("accepts 12+ characters with a letter and a number, spaces allowed", () => {
    expect(newPasswordSchema.safeParse("quiet river 42").success).toBe(true);
  });
  it.each([
    ["short1abcde", "Use at least 12 characters"],
    ["onlyletterswords", "Include at least one number"],
    ["123456789012", "Include at least one letter"],
    ["a1".repeat(37), "Use 72 characters or fewer"],
  ])("rejects %j with a specific message", (v, message) => {
    const r = newPasswordSchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(message);
  });
});

describe("sign-in and sign-up", () => {
  it("sign-in needs email and a password, without new-password rules", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
    const r = signInSchema.safeParse({ email: "nope", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "password"]);
  });
  it("sign-in accepts passwords up to the API's 128 characters", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x".repeat(128) }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x".repeat(129) }).success).toBe(false);
  });
  it("sign-up sends only what POST /api/auth/signup accepts", () => {
    const r = signUpSchema.parse({ email: " A@Example.com ", password: "quiet river 42" });
    expect(r).toEqual({ email: "a@example.com", password: "quiet river 42" });
  });
});

describe("forgot password", () => {
  it("needs an email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});