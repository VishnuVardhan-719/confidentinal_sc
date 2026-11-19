import { fail } from "@/lib/api/result";
import type { PrescriptionDraftsApi } from "./api";

/** No prescription contract and no clinical/pharmacy production approval: fail closed. */
export function createPrescriptionDraftsHttpApi(): PrescriptionDraftsApi {
  return {
    getDraft: async () => fail("gated"),
    saveDraft: async () => fail("gated"),
    discardDraft: async () => fail("gated"),
  };
}
