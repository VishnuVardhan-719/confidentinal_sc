import { getAdapterMode } from "@/lib/api/mode";
import type { DoctorApi } from "./api";
import { createDoctorFixtureApi } from "./fixture";
import { createDoctorHttpApi } from "./http";

export type { DoctorApi } from "./api";
export * from "./types";
export * from "./status";
export * from "./otp";
export * from "./visit";
export * from "./timeline";

/** Adapter chosen by FRONTEND_ADAPTER; fixture throws when APP_ENV=production. */
export function getDoctorApi(env: Record<string, string | undefined> = process.env): DoctorApi {
  return getAdapterMode(env) === "fixture" ? createDoctorFixtureApi() : createDoctorHttpApi();
}
