import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/result";

/** Map an ApiErrorCode (or anything unknown) to a key in the `errors.api` namespace. */
export type ErrorMessageKey = ApiErrorCode | "generic";

export function errorMessageKey(code: unknown): ErrorMessageKey {
  return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : "generic";
}
