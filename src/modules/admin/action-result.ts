import type { ApiErrorCode, ApiResult } from "@/lib/api/result";

/**
 * What a server action returns to a client island. Compatible with the shared
 * ConfirmDialog `ConfirmResult`. Never carries server text or record data the
 * client did not already have; the page refetches on success. The one exception
 * is `reference`: the public booking reference of a record the action created
 * (no personal or clinical data), so the user can be told which request was made.
 */
export type ActionResult = { ok: true; reference?: string } | { ok: false; code: ApiErrorCode; fields?: Record<string, string> };

export function toActionResult<T>(result: ApiResult<T>): ActionResult {
  if (result.ok) return { ok: true };
  return result.error.fields ? { ok: false, code: result.error.code, fields: result.error.fields } : { ok: false, code: result.error.code };
}
