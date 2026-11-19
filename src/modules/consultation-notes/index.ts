import { fail } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { ApiContext } from "@/modules/clinical/context";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import type { ConsultationNotesApi } from "./api";
import { createConsultationNotesFixtureApi } from "./fixture";
import { createConsultationNotesHttpApi } from "./http";

export type { ConsultationNotesApi } from "./api";
export * from "./types";

type Env = Record<string, string | undefined>;

const GATED: ConsultationNotesApi = {
  getNote: async () => fail("gated"),
  saveDraft: async () => fail("gated"),
  signOff: async () => fail("gated"),
};

/** Behind FEATURE_CLINICAL (off unless exactly "true"). Fixture is synthetic and refused in production; http is gated. */
export function getConsultationNotesApi(env: Env = process.env, ctx: ApiContext = {}): ConsultationNotesApi {
  if (!isClinicalEnabled(env)) return GATED;
  return getAdapterMode(env) === "fixture" ? createConsultationNotesFixtureApi({ env, actor: ctx.fixtureActor }) : createConsultationNotesHttpApi();
}
