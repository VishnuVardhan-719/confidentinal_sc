import { fail } from "@/lib/api/result";
import type { ReviewModerationApi, ReviewsApi } from "./api";

/** No patient reviews contract yet (docs/frontend/REQUESTS.md R-FE-P-R7-3). Fails closed; no network calls. */
export function createReviewsHttpApi(): ReviewsApi {
  return {
    listVisits: async () => fail("gated"),
    getVisit: async () => fail("gated"),
    submit: async () => fail("gated"),
    edit: async () => fail("gated"),
    withdraw: async () => fail("gated"),
  };
}

/** No moderation contract yet (REQUESTS.md R-FE-P-R8-1). Fails closed; no network calls. */
export function createReviewModerationHttpApi(): ReviewModerationApi {
  return {
    listQueue: async () => fail("gated"),
    decide: async () => fail("gated"),
  };
}
