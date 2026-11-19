import { fail } from "@/lib/api/result";
import type { DoctorReviewsApi } from "./api";

/** No provider-side reviews endpoint in docs/API_CONTRACTS.md: fail closed, no network calls. */
export function createDoctorReviewsHttpApi(): DoctorReviewsApi {
  return { listMine: async () => fail("gated") };
}
