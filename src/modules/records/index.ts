import { getAdapterMode } from "@/lib/api/mode";
import { NO_ACTOR } from "@/fixtures/clinical/world";
import type { ApiContext } from "@/modules/clinical/context";
import { NO_SESSION_HTTP } from "@/modules/clinical/http-util";
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
export function getRecordsApi(env: Env = process.env, ctx: ApiContext = {}): RecordsApi {
  const api =
    getAdapterMode(env) === "fixture"
      ? createRecordsFixtureApi({ env, actor: ctx.fixtureActor ?? NO_ACTOR })
      : createRecordsHttpApi(ctx.http ?? NO_SESSION_HTTP);
  const gatedKeys = (Object.keys(api) as (keyof RecordsApi)[]).filter((k) => !ungated.has(k));
  return gateMethods(api, gatedKeys, env);
}
