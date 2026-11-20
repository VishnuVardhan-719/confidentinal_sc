import { z } from "zod";

/*
 * Auth form schemas (U02). Client-side checks only: the auth endpoints validate again
 * (src/lib/validation/identity.ts). Messages are English until the i18n ticket moves them into dictionaries.
 */

export type MobileCheck = { ok: true; e164: string } | { ok: false; message: string };

const MOBILE_MESSAGES = {
  empty: "Enter your mobile number",
  chars: "Use digits only, for example 98765 43210",
  length: "Enter a 10-digit Indian mobile number",
  prefix: "Indian mobile numbers start with 6, 7, 8 or 9",
} as const;

/**
 * Accepts the ways people type Indian mobile numbers: "98765 43210", "+91 98765 43210",
 * "+91-98765-43210", "919876543210" and "09876543210". Returns E.164 ("+919876543210").
 */
export function checkIndianMobile(input: string): MobileCheck {
  const compact = input.replace(/[\s\-().]/g, "");
  if (compact === "") return { ok: false, message: MOBILE_MESSAGES.empty };
  if (!/^\+?\d+$/.test(compact)) return { ok: false, message: MOBILE_MESSAGES.chars };

  let national = compact;
  if (national.startsWith("+91")) national = national.slice(3);
  else if (national.startsWith("+")) return { ok: false, message: MOBILE_MESSAGES.length };
  else if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);

  if (national.length !== 10) return { ok: false, message: MOBILE_MESSAGES.length };
  if (!/^[6-9]/.test(national)) return { ok: false, message: MOBILE_MESSAGES.prefix };
  return { ok: true, e164: `+91${national}` };
}

export const indianMobileSchema = z.string().transform((value, ctx) => {
  const result = checkIndianMobile(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }
  return result.e164;
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .max(254, "Email addresses can be at most 254 characters")
  .pipe(z.email("Enter an email address like name@example.com"));

export const PASSWORD_RULES = { min: 12, max: 72 } as const;
export const PASSWORD_HINT = `At least ${PASSWORD_RULES.min} characters, with at least one letter and one number.`;

/** For creating a password. Not trimmed: spaces are allowed and kept. 72 is the bcrypt input limit. */
export const newPasswordSchema = z
  .string()
  .min(1, "Create a password")
  .min(PASSWORD_RULES.min, `Use at least ${PASSWORD_RULES.min} characters`)
  .max(PASSWORD_RULES.max, `Use ${PASSWORD_RULES.max} characters or fewer`)
  .regex(/\p{L}/u, "Include at least one letter")
  .regex(/\p{Nd}/u, "Include at least one number");

/** For signing in: only presence is checked, so older passwords that predate the rules still work. 128 matches the API. */
export const currentPasswordSchema = z.string().min(1, "Enter your password").max(128, "That password is too long");

/** Email and password sign-in (POST /api/auth/login). Phone sign-in has no backend yet, so it is not offered. */
export const signInSchema = z.object({ email: emailSchema, password: currentPasswordSchema });

/** Account creation (POST /api/auth/signup). The server requires at least 12 characters. */
export const signUpSchema = z.object({ email: emailSchema, password: newPasswordSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
