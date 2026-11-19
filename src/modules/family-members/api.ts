import type { ApiResult } from "@/lib/api/result";
import type { FamilyMember } from "./types";

/**
 * Family members API. Inputs are untrusted and re-validated by the adapter (and by the backend).
 * Every write carries the expected version (update/remove) or an idempotency key (create).
 */
export type FamilyMembersApi = {
  list: () => Promise<ApiResult<FamilyMember[]>>;
  get: (memberId: string) => Promise<ApiResult<FamilyMember>>;
  create: (input: unknown, idempotencyKey: string) => Promise<ApiResult<FamilyMember>>;
  update: (memberId: string, input: unknown, expectedVersion: number) => Promise<ApiResult<FamilyMember>>;
  remove: (memberId: string, expectedVersion: number) => Promise<ApiResult<{ id: string }>>;
};
