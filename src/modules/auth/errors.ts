import type { ApiError } from "@/lib/api/result";

/**
 * ApiError -> message keys. Never render server text. Keys live in the `auth` and
 * `errors` namespaces (see docs/frontend/REQUESTS.md R-FE03-17 / R-FE04-*).
 */

export type AuthFlow = "login" | "signup" | "otp_verify" | "otp_resend" | "logout";

/** Message key for a field-level validation code, e.g. `errors.fields.otp_invalid`. */
export const fieldMessageKey = (code: string): string => `errors.fields.${/^[a-z_]{1,64}$/.test(code) ? code : "invalid"}`;

export function fieldMessageKeys(fields: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, code] of Object.entries(fields ?? {})) out[path] = fieldMessageKey(code);
  return out;
}

export function authErrorKey(error: ApiError, flow: AuthFlow): string {
  switch (error.code) {
    case "validation": {
      const code = error.fields?.code;
      if (code === "otp_invalid") return "auth.errors.otpInvalid";
      if (code === "otp_expired") return "auth.errors.otpExpired";
      return "auth.errors.checkFields";
    }
    case "unauthenticated":
      return flow === "login" ? "auth.errors.invalidCredentials" : "auth.errors.sessionExpired";
    case "forbidden":
      return "auth.errors.accountRestricted";
    case "conflict":
      return flow === "signup" ? "auth.errors.accountExists" : "errors.conflict";
    case "not_found":
      return flow === "otp_verify" || flow === "otp_resend" ? "auth.errors.otpExpired" : "errors.not_found";
    case "rate_limited":
      return "auth.errors.rateLimited";
    case "gated":
      return "auth.errors.methodUnavailable";
    default:
      return "errors.unavailable";
  }
}

/** Generic key for non-auth flows. */
export const errorKey = (error: ApiError): string => `errors.${error.code}`;
