import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type { AuditEvent, AuditFilter, Page } from "./types";

/** Scoped audit event list (security:audit). Read-only. */
export interface AuditApi {
  readonly mode: AdapterMode;
  listEvents(filter?: AuditFilter): Promise<ApiResult<Page<AuditEvent>>>;
}
