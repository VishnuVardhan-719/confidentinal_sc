import { fail } from "@/lib/api/result";
import type { ReviewsApi } from "./api";

/** No patient reviews contract yet (docs/frontend/REQUESTS.md R-FE-P-R7-3). Fails closed; no network calls. */
export function createReviewsHttpApi(): ReviewsApi {
  return {
    listVisits: async () => fail("gated"),
    getVisit: async () => fail("gated"),
    submit: async () => fail("gated"),
  };
}
