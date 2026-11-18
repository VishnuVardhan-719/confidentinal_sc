import { fail } from "@/lib/api/result";
import type { ClinicalApi } from "./api";
import { createHttp, idSegment, type HttpOptions } from "./http-util";
import { saveDraftRequestSchema, signRequestSchema } from "./schemas";
import { consultationSchema, finalizeResponseSchema, saveDraftResponseSchema } from "./types";

/**
 * HTTP adapter for the PROPOSED consultation routes in docs/API_CONTRACTS.md:
 *   POST /api/consultations/:id/draft     -> saveDraft
 *   POST /api/consultations/:id/finalize  -> finalize
 *   GET  /api/consultations/:id           -> getConsultation
 * Not yet contracted, so fail("gated") (logged in docs/frontend/REQUESTS.md):
 *   getDraft (no GET draft route), amend (no route), requestPdfLink (GET /pdf delivers a file,
 *   link-issuing DTO not specified).
 * None of these routes exist on any backend branch yet.
 */
export function createClinicalHttpApi(options: HttpOptions = {}): ClinicalApi {
  const request = createHttp(options);

  return {
    getDraft: async () => fail("gated"),
    saveDraft: async (consultationId, input) => {
      const id = idSegment(consultationId);
      if (!id) return fail("not_found");
      const parsed = saveDraftRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return request({ method: "POST", path: `/api/consultations/${id}/draft`, body: parsed.data, schema: saveDraftResponseSchema });
    },
    finalize: async (consultationId, input, idempotencyKey) => {
      const id = idSegment(consultationId);
      if (!id) return fail("not_found");
      const parsed = signRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return request({ method: "POST", path: `/api/consultations/${id}/finalize`, body: parsed.data, schema: finalizeResponseSchema, idempotencyKey });
    },
    amend: async () => fail("gated"),
    getConsultation: async (consultationId) => {
      const id = idSegment(consultationId);
      if (!id) return fail("not_found");
      return request({ method: "GET", path: `/api/consultations/${id}`, schema: consultationSchema });
    },
    requestPdfLink: async () => fail("gated"),
  };
}
