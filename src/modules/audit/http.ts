import { fail, type ApiResult } from "@/lib/api/result";
import type { AuditApi } from "./api";

/**
 * HTTP adapter for audit. No audit read endpoint is documented in
 * docs/API_CONTRACTS.md, so listing returns `gated` (REQUESTS.md). When one
 * exists, its rows must pass through redactAuditEvent before reaching the UI.
 */
export function createAuditHttpApi(): AuditApi {
  return {
    mode: "http",
    listEvents: async (): Promise<ApiResult<never>> => fail("gated"),
  };
}
