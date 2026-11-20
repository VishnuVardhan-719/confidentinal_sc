import type { ApiResult } from "@/lib/api/result";
import type { DoctorReview } from "./types";

/** Read-only. The doctor cannot reply, hide, rate or moderate here. */
export type DoctorReviewsApi = {
  /** Reviews about the signed-in doctor, any order (the UI sorts). */
  listMine: () => Promise<ApiResult<DoctorReview[]>>;
};
