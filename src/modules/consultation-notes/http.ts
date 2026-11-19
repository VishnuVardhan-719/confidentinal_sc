import { fail } from "@/lib/api/result";
import type { ConsultationNotesApi } from "./api";

/** No consultation-notes contract in docs/API_CONTRACTS.md and no clinical production approval: fail closed. */
export function createConsultationNotesHttpApi(): ConsultationNotesApi {
  return {
    getNote: async () => fail("gated"),
    saveDraft: async () => fail("gated"),
    signOff: async () => fail("gated"),
  };
}
