import type { ApiErrorCode, ApiResult } from "@/lib/api/result";

/**
 * What a server action returns to a client island. Compatible with the shared
 * ConfirmDialog `ConfirmResult`. Never carries server text or record data the
 * client did not already have; the page refetches on success.
 */
export type ActionResult = { ok: true } | { ok: false; code: ApiErrorCode; fields?: Record<string, string> };

export function toActionResult<T>(result: ApiResult<T>): ActionResult {
  if (result.ok) return { ok: true };
  return result.error.fields ? { ok: false, code: result.error.code, fields: result.error.fields } : { ok: false, code: result.error.code };
}
