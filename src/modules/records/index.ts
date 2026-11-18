import { getAdapterMode } from "@/lib/api/mode";
import { DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR } from "@/fixtures/clinical/world";
import { gateMethods } from "@/modules/clinical/gate";
import { UNGATED_RECORDS_METHODS, type RecordsApi } from "./api";
import { createRecordsFixtureApi } from "./fixture";
import { createRecordsHttpApi } from "./http";

export type { RecordsApi } from "./api";
export * from "./types";
export * from "./logic";
export * from "./status";

type Env = Record<string, string | undefined>;

const ungated: ReadonlySet<string> = new Set(UNGATED_RECORDS_METHODS);

/**
 * DC09-DC14 records API. Clinical-record, fact, proof and photo methods return fail("gated")
 * unless FEATURE_CLINICAL=true. Pay-after collection stays available. Fixture mode throws in production.
 */
export function getRecordsApi(env: Env = process.env, fixtureActor: "patient" | "doctor" = "patient"): RecordsApi {
  const api =
    getAdapterMode(env) === "fixture"
      ? createRecordsFixtureApi({ actor: fixtureActor === "doctor" ? DEFAULT_DOCTOR_ACTOR : DEFAULT_PATIENT_ACTOR })
      : createRecordsHttpApi();
  const gatedKeys = (Object.keys(api) as (keyof RecordsApi)[]).filter((k) => !ungated.has(k));
  return gateMethods(api, gatedKeys, env);
}
