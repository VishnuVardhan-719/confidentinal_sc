import { fail } from "@/lib/api/result";
import type { FamilyMembersApi } from "./api";

/**
 * No family-members contract exists in docs/API_CONTRACTS.md (requested in docs/frontend/REQUESTS.md
 * R-FE-P-R7-1). Fails closed with `gated`; no speculative network calls.
 */
export function createFamilyMembersHttpApi(): FamilyMembersApi {
  return {
    list: async () => fail("gated"),
    get: async () => fail("gated"),
    create: async () => fail("gated"),
    update: async () => fail("gated"),
    remove: async () => fail("gated"),
  };
}
