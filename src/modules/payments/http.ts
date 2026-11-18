import { z } from "zod";
import { fail } from "@/lib/api/result";
import { collectionRecordSchema } from "./schemas";
import type { PaymentsApi } from "./api";
/** No verified payment projection/collection endpoint on inspected B01/C01 refs.
 * Fail closed until backend and finance gates supply an approved contract. */
export function createPaymentsHttpApi(): PaymentsApi {
  return {
    async getSummary(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "validation"); },
    async recordCollection(input, key) { return fail(collectionRecordSchema.safeParse(input).success && z.uuid().safeParse(key).success ? "gated" : "validation"); },
  };
}
