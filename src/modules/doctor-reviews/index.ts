import { fail } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { ApiContext } from "@/modules/clinical/context";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import type { DoctorReviewsApi } from "./api";
import { createDoctorReviewsFixtureApi } from "./fixture";
import { createDoctorReviewsHttpApi } from "./http";

export type { DoctorReviewsApi } from "./api";
export * from "./types";

type Env = Record<string, string | undefined>;

/**
 * Doctor reviews view. Per PHASE R7-D every new doctor workspace feature sits behind the clinical
 * flag (off in production) until approved; fixture is synthetic and refused in production; http is gated.
 */
export function getDoctorReviewsApi(env: Env = process.env, ctx: ApiContext = {}): DoctorReviewsApi {
  if (!isClinicalEnabled(env)) return { listMine: async () => fail("gated") };
  return getAdapterMode(env) === "fixture" ? createDoctorReviewsFixtureApi({ env, actor: ctx.fixtureActor }) : createDoctorReviewsHttpApi();
}
