import { fail, ok } from "@/lib/api/result";
import { assertFixtureAllowed, NO_ACTOR, type ClinicalWorld } from "@/fixtures/clinical/world";
import { createRecordsFixtureApi } from "@/modules/records/fixture";
import type { ProofCheckApi } from "./api";
import { normalizeProofCode, proofCheckResultSchema, type ProofCheckResult } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Synthetic proof check over the shared clinical fixture world, so a proof a doctor creates on the
 * visit page can be checked here. Public: no actor. The result is rebuilt field by field and
 * schema-checked, so nothing beyond the approved minimum can reach the page.
 */
export function createProofCheckFixtureApi({ env = process.env, world, now }: { env?: Env; world?: ClinicalWorld; now?: () => Date } = {}): ProofCheckApi {
  assertFixtureAllowed(env);
  const records = createRecordsFixtureApi({ env, world, actor: NO_ACTOR, ...(now ? { now } : {}) });
  return {
    check: async (raw) => {
      const code = normalizeProofCode(raw);
      if (!code) return ok({ status: "unknown" });
      const r = await records.verifyProof(code);
      if (!r.ok) return fail(r.error.code);
      const v = r.data;
      const result: ProofCheckResult =
        v.status === "valid"
          ? { status: "valid", serviceDate: v.serviceDate, serviceCategory: v.serviceCategory, providerDisplayName: v.providerDisplayName }
          : { status: v.status === "not_found" ? "unknown" : v.status };
      const parsed = proofCheckResultSchema.safeParse(result);
      return parsed.success ? ok(parsed.data) : fail("unavailable");
    },
  };
}
