import { fail } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { ApiContext } from "@/modules/clinical/context";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import type { PrescriptionDraftsApi } from "./api";
import { createPrescriptionDraftsFixtureApi } from "./fixture";
import { createPrescriptionDraftsHttpApi } from "./http";

export type { PrescriptionDraftsApi } from "./api";
export * from "./types";

type Env = Record<string, string | undefined>;

const GATED: PrescriptionDraftsApi = {
  getDraft: async () => fail("gated"),
  saveDraft: async () => fail("gated"),
  discardDraft: async () => fail("gated"),
};

/** Behind FEATURE_CLINICAL. Fixture is synthetic and refused in production; http is gated. */
export function getPrescriptionDraftsApi(env: Env = process.env, ctx: ApiContext = {}): PrescriptionDraftsApi {
  if (!isClinicalEnabled(env)) return GATED;
  return getAdapterMode(env) === "fixture" ? createPrescriptionDraftsFixtureApi({ env, actor: ctx.fixtureActor }) : createPrescriptionDraftsHttpApi();
}
