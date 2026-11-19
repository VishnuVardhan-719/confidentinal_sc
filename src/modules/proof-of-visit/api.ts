import type { ApiResult } from "@/lib/api/result";
import type { ProofCheckResult } from "./types";

export type ProofCheckApi = {
  /** Public, unauthenticated. `code` must already be normalized (normalizeProofCode). */
  check: (code: string) => Promise<ApiResult<ProofCheckResult>>;
};
