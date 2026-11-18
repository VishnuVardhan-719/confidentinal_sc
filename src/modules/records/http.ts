import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { createHttp, idSegment, type HttpOptions } from "@/modules/clinical/http-util";
import { consultationSchema } from "@/modules/clinical/types";
import type { RecordsApi } from "./api";
import { COLLECTION_STATUSES, collectionInputSchema, collectionRecordSchema, proofOfVisitSchema, type CollectionView } from "./types";

const PAYMENT_STATES = ["NOT_INITIATED", "DUE", "PROCESSING", "PAID", "PARTIALLY_PAID", "DISPUTED", "REFUNDED"] as const;
const collectionViewSchema: z.ZodType<CollectionView> = z.strictObject({
  bookingId: z.string().min(1),
  status: z.enum(COLLECTION_STATUSES),
  record: collectionRecordSchema.nullable(),
  paymentState: z.enum(PAYMENT_STATES),
  amountDuePaise: z.number().int().nonnegative(),
});

/**
 * HTTP adapter. Uses only routes listed in docs/API_CONTRACTS.md:
 *   GET  /api/consultations/:id         -> getMyRecord (final only; drafts treated as not_found)
 *   POST /api/bookings/:id/collection   -> recordCollection
 *   POST /api/bookings/:id/proof        -> issueProof
 * Everything else returns fail("gated") until a contract exists (docs/frontend/REQUESTS.md).
 */
export function createRecordsHttpApi(options: HttpOptions): RecordsApi {
  const request = createHttp(options);

  return {
    listMyRecords: async () => fail("gated"),
    getMyRecord: async (consultationId) => {
      const id = idSegment(consultationId);
      if (!id) return fail("not_found");
      const r = await request({ method: "GET", path: `/api/consultations/${id}`, schema: consultationSchema });
      if (!r.ok) return r;
      // Defence in depth: a patient view never renders a draft even if the server returned one.
      return r.data.status === "final" ? ok(r.data) : fail("not_found");
    },
    requestMyRecordPdfLink: async () => fail("gated"),
    getCollection: async () => fail("gated"),
    recordCollection: async (bookingId, input, idempotencyKey) => {
      const id = idSegment(bookingId);
      if (!id) return fail("not_found");
      const parsed = collectionInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return request({ method: "POST", path: `/api/bookings/${id}/collection`, body: parsed.data, schema: collectionViewSchema, idempotencyKey });
    },
    listHealthFacts: async () => fail("gated"),
    confirmHealthFacts: async () => fail("gated"),
    correctHealthFact: async () => fail("gated"),
    issueProof: async (bookingId, idempotencyKey) => {
      const id = idSegment(bookingId);
      if (!id) return fail("not_found");
      return request({ method: "POST", path: `/api/bookings/${id}/proof`, body: {}, schema: proofOfVisitSchema, idempotencyKey });
    },
    revokeProof: async () => fail("gated"),
    verifyProof: async () => fail("gated"),
    getPhotoConsent: async () => fail("gated"),
    recordPhotoConsent: async () => fail("gated"),
    registerPhotoUpload: async () => fail("gated"),
    listPhotos: async () => fail("gated"),
    requestPhotoViewLink: async () => fail("gated"),
  };
}
