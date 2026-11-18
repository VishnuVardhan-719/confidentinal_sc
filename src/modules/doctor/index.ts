import { getAdapterMode } from "@/lib/api/mode";
import { NO_ACTOR } from "@/fixtures/clinical/world";
import type { ApiContext } from "@/modules/clinical/context";
import { NO_SESSION_HTTP } from "@/modules/clinical/http-util";
import type { DoctorApi } from "./api";
import { createDoctorFixtureApi } from "./fixture";
import { createDoctorHttpApi } from "./http";

export type { DoctorApi } from "./api";
export * from "./types";
export * from "./status";
export * from "./otp";
export * from "./visit";
export * from "./timeline";
export * from "./routing";
export * from "./loaders";

/** Adapter chosen by FRONTEND_ADAPTER; fixture throws when APP_ENV=production. */
export function getDoctorApi(env: Record<string, string | undefined> = process.env, ctx: ApiContext = {}): DoctorApi {
  return getAdapterMode(env) === "fixture"
    ? createDoctorFixtureApi({ env, actor: ctx.fixtureActor ?? NO_ACTOR })
    : createDoctorHttpApi(ctx.http ?? NO_SESSION_HTTP);
}
