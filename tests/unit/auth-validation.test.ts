import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/components/ui/form-field";
import {
  SIGNUP_ROLES,
  checkIndianMobile,
  emailSchema,
  forgotPasswordSchema,
  newPasswordSchema,
  signInSchema,
  verifyOtpSchema,
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
  it("accepts 10+ characters with a letter and a number, spaces allowed", () => {
    expect(newPasswordSchema.safeParse("quiet river 42").success).toBe(true);
  });
  it.each([
    ["short1abc", "Use at least 10 characters"],
    ["onlyletterswords", "Include at least one number"],
    ["1234567890", "Include at least one letter"],
    ["a1".repeat(37), "Use 72 characters or fewer"],
  ])("rejects %j with a specific message", (v, message) => {
    const r = newPasswordSchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(message);
  });
});

describe("sign-in", () => {
  it("phone method needs only a valid mobile", () => {
    const r = signInSchema.safeParse({ method: "phone", phone: "98765 43210", email: "", password: "" });
    expect(r.success && r.data).toEqual({ method: "phone", phone: "+919876543210" });
  });
  it("email method needs email and a password, without new-password rules", () => {
    expect(signInSchema.safeParse({ method: "email", email: "a@example.com", password: "x" }).success).toBe(true);
    const r = signInSchema.safeParse({ method: "email", email: "nope", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "password"]);
  });
});

describe("sign-up roles", () => {
  it("offers exactly the five public roles", () => {
    expect([...SIGNUP_ROLES]).toEqual(["patient", "doctor", "lab", "ambulance", "caretaker"]);
    expect(SIGNUP_ROLES).not.toContain("admin");
  });
});

describe("forgot password and OTP", () => {
  it("forgot password needs an email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
  it.each([["123456", "123456"], ["123 456", "123456"]])("accepts code %j", (code, out) => {
    expect(verifyOtpSchema.parse({ code })).toEqual({ code: out });
  });
  it.each([
    ["", "Enter the 6-digit code"],
    ["12345", "The code is 6 digits"],
    ["1234567", "The code is 6 digits"],
    ["12a456", "The code is 6 digits"],
  ])("rejects code %j", (code, message) => {
    const r = verifyOtpSchema.safeParse({ code });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).code).toBe(message);
  });
});
