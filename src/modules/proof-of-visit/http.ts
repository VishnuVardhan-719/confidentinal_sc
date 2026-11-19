import { fail } from "@/lib/api/result";
import type { ProofCheckApi } from "./api";

/**
 * docs/API_CONTRACTS.md lists only `POST /api/bookings/:id/proof` (issue/revoke); there is no public
 * verification endpoint yet, and clinical production activation needs owner approval. Fails closed.
 */
export function createProofCheckHttpApi(): ProofCheckApi {
  return { check: async () => fail("gated") };
}
